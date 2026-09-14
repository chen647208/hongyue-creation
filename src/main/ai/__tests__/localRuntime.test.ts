/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userData: '',
  warn: vi.fn(),
  spawn: vi.fn(),
  handlers: new Map<string, (...args: any[]) => any>(),
}));

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any): void => {
      state.handlers.set(channel, fn);
    },
  },
}));

vi.mock('node:child_process', () => ({ spawn: state.spawn }));

vi.mock('../../logger.js', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() },
}));

import type { LocalRuntimeConfig } from '../../../shared/types.js';
import { IPC } from '../../channels.js';

async function load() {
  return import('../localRuntime.js');
}

function fakeChild(pid = 4321) {
  const listeners: Record<string, (arg?: unknown) => void> = {};
  return {
    pid,
    exitCode: null as number | null,
    on: vi.fn((event: string, cb: (arg?: unknown) => void) => {
      listeners[event] = cb;
    }),
    kill: vi.fn(),
    listeners,
  };
}

const config = (over: Partial<LocalRuntimeConfig> = {}): LocalRuntimeConfig => ({
  enabled: true,
  endpoint: 'http://127.0.0.1:8080/v1',
  command: 'llama-server',
  args: ['--port', '8080'],
  ...over,
});

describe('LocalRuntimeManager（进程生命周期）', () => {
  beforeEach(() => {
    vi.resetModules();
    state.userData = mkdtempSync(join(tmpdir(), 'hy-runtime-'));
    state.spawn.mockReset();
    state.warn.mockClear();
    state.handlers.clear();
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
  });

  it('未启用或缺 command 时不启动进程', async () => {
    const { LocalRuntimeManager } = await load();
    const manager = new LocalRuntimeManager(state.userData);
    expect(manager.start({ enabled: false, endpoint: 'x' })).toEqual({ running: false });
    expect(manager.start({ enabled: true, endpoint: 'x' })).toEqual({ running: false });
    expect(state.spawn).not.toHaveBeenCalled();
    expect(manager.isRunning()).toBe(false);
    expect(manager.pid()).toBeUndefined();
  });

  it('启动子进程并透传最小环境与工作目录', async () => {
    const child = fakeChild();
    state.spawn.mockReturnValue(child);
    const { LocalRuntimeManager } = await load();
    const manager = new LocalRuntimeManager(state.userData);

    expect(manager.start(config())).toEqual({ running: true, pid: 4321 });
    expect(state.spawn).toHaveBeenCalledWith(
      'llama-server',
      ['--port', '8080'],
      expect.objectContaining({ cwd: state.userData, windowsHide: true, stdio: 'ignore' }),
    );
    const options = state.spawn.mock.calls[0]![2] as { env: Record<string, unknown> };
    expect(Object.keys(options.env).sort()).toEqual(['HOME', 'PATH', 'SystemRoot', 'USERPROFILE']);
    expect(manager.isRunning()).toBe(true);
    expect(manager.pid()).toBe(4321);
  });

  it('已在运行时不重复启动', async () => {
    state.spawn.mockReturnValue(fakeChild());
    const { LocalRuntimeManager } = await load();
    const manager = new LocalRuntimeManager(state.userData);
    manager.start(config());
    expect(manager.start(config())).toEqual({ running: true, pid: 4321 });
    expect(state.spawn).toHaveBeenCalledTimes(1);
  });

  it('子进程 exit 后回到未运行状态', async () => {
    const child = fakeChild();
    state.spawn.mockReturnValue(child);
    const { LocalRuntimeManager } = await load();
    const manager = new LocalRuntimeManager(state.userData);
    manager.start(config());
    child.listeners.exit?.();
    expect(manager.isRunning()).toBe(false);
  });

  it('子进程 error 记 warn', async () => {
    const child = fakeChild();
    state.spawn.mockReturnValue(child);
    const { LocalRuntimeManager } = await load();
    const manager = new LocalRuntimeManager(state.userData);
    manager.start(config());
    child.listeners.error?.(new Error('spawn failed'));
    expect(state.warn).toHaveBeenCalled();
  });

  it('stop 终止运行中的子进程', async () => {
    const child = fakeChild();
    state.spawn.mockReturnValue(child);
    const { LocalRuntimeManager } = await load();
    const manager = new LocalRuntimeManager(state.userData);
    manager.start(config());
    manager.stop();
    expect(child.kill).toHaveBeenCalled();
    expect(manager.isRunning()).toBe(false);
  });

  it('stop 对已退出的子进程不 kill', async () => {
    const child = fakeChild();
    child.exitCode = 0;
    state.spawn.mockReturnValue(child);
    const { LocalRuntimeManager } = await load();
    const manager = new LocalRuntimeManager(state.userData);
    manager.start(config());
    manager.stop();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('stop 时 kill 抛错记 warn 不抛出', async () => {
    const child = fakeChild();
    child.kill.mockImplementation(() => {
      throw new Error('kill failed');
    });
    state.spawn.mockReturnValue(child);
    const { LocalRuntimeManager } = await load();
    const manager = new LocalRuntimeManager(state.userData);
    manager.start(config());
    expect(() => manager.stop()).not.toThrow();
    expect(state.warn).toHaveBeenCalled();
  });
});

describe('probe 与配置读写', () => {
  beforeEach(() => {
    vi.resetModules();
    state.userData = mkdtempSync(join(tmpdir(), 'hy-runtime-'));
    state.spawn.mockReset();
    state.warn.mockClear();
    state.handlers.clear();
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('probe 用注入的 fetch 探测并解析模型', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'm1' }] }), { status: 200 }));
    const { LocalRuntimeManager } = await load();
    const manager = new LocalRuntimeManager(state.userData);
    const result = await manager.probe(
      { enabled: true, endpoint: 'http://127.0.0.1:8080/v1' },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.reachable).toBe(true);
    expect(result.models[0]?.id).toBe('m1');
  });

  it('probe 缺省使用全局 fetch', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { LocalRuntimeManager } = await load();
    const manager = new LocalRuntimeManager(state.userData);
    await expect(manager.probe({ enabled: true, endpoint: 'http://127.0.0.1:11434' })).resolves.toMatchObject({
      reachable: true,
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('loadLocalInferenceConfig 读取收窄字段，缺失回默认', async () => {
    const { loadLocalInferenceConfig, saveLocalInferenceConfig } = await load();
    expect(loadLocalInferenceConfig()).toEqual({ enabled: false, endpoint: '' });

    saveLocalInferenceConfig({
      enabled: true,
      endpoint: 'http://127.0.0.1:8080/v1',
      command: 'serv',
      args: ['--a'],
      autoStart: true,
      model: 'm',
    });
    expect(loadLocalInferenceConfig()).toEqual({
      enabled: true,
      endpoint: 'http://127.0.0.1:8080/v1',
      command: 'serv',
      args: ['--a'],
      autoStart: true,
      model: 'm',
    });
  });

  it('损坏配置文件回退默认', async () => {
    writeFileSync(join(state.userData, 'local-inference.json'), 'not json', 'utf-8');
    const { loadLocalInferenceConfig } = await load();
    expect(loadLocalInferenceConfig()).toEqual({ enabled: false, endpoint: '' });
  });

  it('配置文件字段类型不符时收窄或丢弃', async () => {
    writeFileSync(
      join(state.userData, 'local-inference.json'),
      JSON.stringify({ enabled: 'yes', endpoint: 5, args: [1, 'a'], autoStart: 1 }),
      'utf-8',
    );
    const { loadLocalInferenceConfig } = await load();
    expect(loadLocalInferenceConfig()).toEqual({ enabled: false, endpoint: '', args: ['a'], autoStart: false });
  });

  it('注册 IPC 并驱动配置/状态/启停/探测', async () => {
    state.spawn.mockReturnValue(fakeChild(999));
    const mod = await load();
    mod.registerLocalInferenceIpc();

    const get = state.handlers.get(IPC.local.getConfig)!;
    const set = state.handlers.get(IPC.local.setConfig)!;
    const start = state.handlers.get(IPC.local.start)!;
    const stop = state.handlers.get(IPC.local.stop)!;
    const status = state.handlers.get(IPC.local.status)!;
    const probe = state.handlers.get(IPC.local.probe)!;

    expect(get(null)).toEqual(expect.objectContaining({ enabled: false }));
    expect(set(null, { enabled: true, endpoint: 'http://127.0.0.1:8080/v1', command: 'serv', args: 'nope', autoStart: true })).toEqual({
      ok: true,
    });
    expect(get(null)).toEqual(expect.objectContaining({ enabled: true, endpoint: 'http://127.0.0.1:8080/v1', command: 'serv' }));
    expect(start(null)).toEqual({ running: true, pid: 999 });
    expect(status(null)).toEqual({ running: true, pid: 999 });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 })));
    await expect(probe(null)).resolves.toMatchObject({ reachable: true });

    expect(stop(null)).toEqual({ ok: true });
    mod.shutdownLocalRuntime();
  });

  it('shutdownLocalRuntime 在未启动时安全', async () => {
    const mod = await load();
    expect(() => mod.shutdownLocalRuntime()).not.toThrow();
  });
});
