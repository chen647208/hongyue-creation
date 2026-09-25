/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

type IpcHandler = (...args: unknown[]) => unknown;

const handlers = vi.hoisted(() => new Map<string, IpcHandler>());
const dialogState = vi.hoisted(() => ({ response: 1, calls: 0 }));
const userDataDir = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir.current },
  ipcMain: { handle: (channel: string, handler: IpcHandler) => handlers.set(channel, handler) },
  dialog: {
    showMessageBox: vi.fn(async () => {
      dialogState.calls += 1;
      return { response: dialogState.response };
    }),
  },
}));

vi.mock('../../app/window.js', () => ({
  getMainWindow: vi.fn(() => ({ id: 1 })),
}));

vi.mock('../client.js', () => ({
  MinimalMcpClient: vi.fn(),
}));

vi.mock('../server.js', () => ({
  dispatch: vi.fn(() => ({ tools: [{ name: 'builtin-tool' }] })),
}));

import { IPC } from '../../channels.js';
import { MinimalMcpClient } from '../client.js';
import { closeMcpClients, registerMcpClientIpc } from '../clientIpc.js';
import { approveMcpCommand, isMcpCommandApproved, mcpFingerprint } from '../commandApproval.js';

const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!(null, ...args) as Promise<unknown>;

/** 让 MinimalMcpClient 假装成功启动，并记录实例以便断言 close。 */
function stubClientBehavior(startError?: Error) {
  const instances: Array<{ close: ReturnType<typeof vi.fn> }> = [];
  (MinimalMcpClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
    const instance = {
      start: vi.fn(() => (startError ? Promise.reject(startError) : Promise.resolve())),
      listTools: vi.fn(async () => [{ name: 'ext-tool' }]),
      callTool: vi.fn(async () => ({ ok: true })),
      close: vi.fn(async () => {}),
    };
    instances.push(instance);
    return instance;
  });
  return instances;
}

describe('mcp clientIpc', () => {
  let dir = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hongyue-mcp-ipc-'));
    userDataDir.current = dir;
    handlers.clear();
    dialogState.response = 1;
    dialogState.calls = 0;
    (MinimalMcpClient as unknown as ReturnType<typeof vi.fn>).mockReset();
    registerMcpClientIpc();
  });

  afterEach(async () => {
    await closeMcpClients();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('builtin 走进程内直连，不 spawn 子进程', async () => {
    stubClientBehavior();
    await expect(call(IPC.mcp.clientConnect, 'builtin', 'builtin')).resolves.toEqual({ connected: true });
    expect(MinimalMcpClient).not.toHaveBeenCalled();
    await expect(call(IPC.mcp.clientTools, 'builtin')).resolves.toEqual({ tools: [{ name: 'builtin-tool' }] });
  });

  it('同一 id 重复连接幂等复用，不重复 spawn', async () => {
    const instances = stubClientBehavior();
    approveMcpCommand(mcpFingerprint('cmd', []));
    await call(IPC.mcp.clientConnect, 'ext', 'cmd');
    await expect(call(IPC.mcp.clientConnect, 'ext', 'cmd')).resolves.toEqual({ connected: true });
    expect(instances).toHaveLength(1);
  });

  it('未批准的命令先弹原生对话框：拒绝即报错且不落盘；允许则放行并持久化', async () => {
    stubClientBehavior();
    const fp = mcpFingerprint('npx', ['-y', 'ext']);

    dialogState.response = 0;
    await expect(call(IPC.mcp.clientConnect, 'ext', 'npx', ['-y', 'ext'])).rejects.toThrow('用户未批准');
    expect(dialogState.calls).toBe(1);
    expect(isMcpCommandApproved(fp)).toBe(false);

    dialogState.response = 1;
    await expect(call(IPC.mcp.clientConnect, 'ext', 'npx', ['-y', 'ext'])).resolves.toEqual({ connected: true });
    expect(isMcpCommandApproved(fp)).toBe(true);
  });

  it('已批准的命令不再弹框', async () => {
    stubClientBehavior();
    approveMcpCommand(mcpFingerprint('npx', ['-y', 'ext']));
    await call(IPC.mcp.clientConnect, 'ext', 'npx', ['-y', 'ext']);
    expect(dialogState.calls).toBe(0);
  });

  it('spawn 失败时不留在连接表，错误原样上抛', async () => {
    const instances = stubClientBehavior(new Error('spawn boom'));
    await expect(call(IPC.mcp.clientConnect, 'ext', 'npx', ['-y', 'ext'])).rejects.toThrow('spawn boom');
    expect(instances[0]?.close).toHaveBeenCalled();
    await expect(call(IPC.mcp.clientTools, 'ext')).rejects.toThrow('MCP server 未连接');
  });

  it('连接数上限 8，超出即报错', async () => {
    stubClientBehavior();
    approveMcpCommand(mcpFingerprint('cmd', []));
    for (let i = 1; i <= 8; i += 1) {
      await expect(call(IPC.mcp.clientConnect, `ext-${i}`, 'cmd')).resolves.toEqual({ connected: true });
    }
    await expect(call(IPC.mcp.clientConnect, 'ext-9', 'cmd')).rejects.toThrow('上限');
  });

  it('clientCall 校验工具名后透传；clientDisconnect 清理后报未连接', async () => {
    const instances = stubClientBehavior();
    approveMcpCommand(mcpFingerprint('cmd', []));
    await call(IPC.mcp.clientConnect, 'builtin', 'builtin');
    // builtin 进程内直连：callTool 走 dispatch
    await expect(call(IPC.mcp.clientCall, 'builtin', 'builtin-tool', { a: 1 })).resolves.toEqual({
      tools: [{ name: 'builtin-tool' }],
    });
    await expect(call(IPC.mcp.clientCall, 'builtin', '', {})).rejects.toThrow(TypeError);

    // ext 子进程客户端：callTool 透传给实例
    await call(IPC.mcp.clientConnect, 'ext', 'cmd');
    await expect(call(IPC.mcp.clientCall, 'ext', 'ext-tool', { a: 1 })).resolves.toEqual({ ok: true });

    await call(IPC.mcp.clientDisconnect, 'builtin');
    expect(instances).toHaveLength(1); // builtin 不经 MinimalMcpClient，只有 ext 一个实例
    await expect(call(IPC.mcp.clientTools, 'builtin')).rejects.toThrow('MCP server 未连接');
    await expect(call(IPC.mcp.clientDisconnect, 'builtin')).resolves.toEqual({ connected: false });
  });

  it('连接参数非法（空 id / 非字符串 command / args 混入非字符串）即 TypeError', async () => {
    stubClientBehavior();
    await expect(call(IPC.mcp.clientConnect, '', 'cmd')).rejects.toThrow(TypeError);
    await expect(call(IPC.mcp.clientConnect, 'a', 42)).rejects.toThrow(TypeError);
    await expect(call(IPC.mcp.clientConnect, 'a', 'cmd', ['ok', 1])).rejects.toThrow(TypeError);
  });

  it('closeMcpClients 关闭全部子进程连接', async () => {
    const instances = stubClientBehavior();
    approveMcpCommand(mcpFingerprint('cmd', []));
    await call(IPC.mcp.clientConnect, 'ext', 'cmd');
    await closeMcpClients();
    expect(instances[0]?.close).toHaveBeenCalled();
    await expect(call(IPC.mcp.clientTools, 'ext')).rejects.toThrow('MCP server 未连接');
  });
});
