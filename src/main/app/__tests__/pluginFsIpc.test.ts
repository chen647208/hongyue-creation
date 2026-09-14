/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any): void => {
      state.handlers.set(channel, fn);
    },
  },
}));

import { IPC } from '../../channels.js';
import { registerPluginFsIpc } from '../pluginFs.js';

describe('registerPluginFsIpc（插件 fs 代理通道）', () => {
  let root: string;

  beforeEach(() => {
    state.handlers.clear();
    root = mkdtempSync(join(tmpdir(), 'hy-pluginfs-ipc-'));
    mkdirSync(join(root, 'skills'), { recursive: true });
    writeFileSync(join(root, 'skills', 'ok.md'), '# ok', 'utf-8');
    writeFileSync(join(root, 'bin.wasm'), Buffer.from([0, 1, 2, 255]));
    registerPluginFsIpc();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('注册三个通道', () => {
    for (const channel of [IPC.pluginReadFile, IPC.pluginReadBinary, IPC.pluginListDirectory]) {
      expect(state.handlers.has(channel)).toBe(true);
    }
  });

  it('read-file 经门读取文本', async () => {
    const handler = state.handlers.get(IPC.pluginReadFile)!;
    await expect(handler(null, root, 'skills/ok.md')).resolves.toBe('# ok');
    await expect(handler(null, root, '../escape.md')).rejects.toThrow('非法');
  });

  it('read-binary 返回 base64 编码', async () => {
    const handler = state.handlers.get(IPC.pluginReadBinary)!;
    await expect(handler(null, root, 'bin.wasm')).resolves.toBe(Buffer.from([0, 1, 2, 255]).toString('base64'));
  });

  it('list-directory 返回名字与类型', async () => {
    const handler = state.handlers.get(IPC.pluginListDirectory)!;
    await expect(handler(null, root, 'skills')).resolves.toEqual([{ name: 'ok.md', type: 'file' }]);
  });
});
