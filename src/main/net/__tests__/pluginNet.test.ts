/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userData: '',
  warn: vi.fn(),
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

vi.mock('../../logger.js', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() },
}));

import { IPC } from '../../channels.js';
import { performPluginNetFetch } from '../pluginNet.js';

const policyFile = (): string => join(state.userData, 'plugin-net-policy.json');

async function register(): Promise<void> {
  const { registerPluginNetIpc } = await import('../pluginNet.js');
  registerPluginNetIpc();
}

describe('performPluginNetFetch（裁决 + 实际 fetch）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('空白名单默认拒绝，不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await performPluginNetFetch({ allowedHosts: [] }, { url: 'https://example.com' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('白名单放行并按 maxResponseBytes 截断响应体', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'abcdef' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await performPluginNetFetch(
      { allowedHosts: ['example.com'], maxResponseBytes: 3, timeoutMs: 100 },
      { url: 'https://example.com/x', method: 'POST', headers: { 'X-Test': '1' }, body: 'payload' },
    );
    expect(result).toEqual({ ok: true, status: 200, text: 'abc' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/x',
      expect.objectContaining({ method: 'POST', headers: { 'X-Test': '1' }, body: 'payload' }),
    );
  });

  it('fetch 抛 Error 转为可读错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const result = await performPluginNetFetch({ allowedHosts: ['example.com'] }, { url: 'https://example.com' });
    expect(result).toEqual({ ok: false, error: 'network down' });
  });

  it('非 Error 抛出用 String 转换', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject('boom')),
    );
    const result = await performPluginNetFetch({ allowedHosts: ['example.com'] }, { url: 'https://example.com' });
    expect(result).toEqual({ ok: false, error: 'boom' });
  });

  it('超时触发 AbortController 中止', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
    );
    const result = await performPluginNetFetch(
      { allowedHosts: ['example.com'], timeoutMs: 5 },
      { url: 'https://example.com' },
    );
    expect(result).toEqual({ ok: false, error: 'aborted' });
  });
});

describe('registerPluginNetIpc（策略持久化与 IPC）', () => {
  beforeEach(() => {
    vi.resetModules();
    state.handlers.clear();
    state.warn.mockClear();
    state.userData = mkdtempSync(join(tmpdir(), 'hy-pluginnet-'));
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('未配置文件时返回默认策略', async () => {
    await register();
    const get = state.handlers.get(IPC.plugin.netGetPolicy)!;
    expect(get(null)).toEqual({
      allowedHosts: [],
      allowedMethods: ['GET', 'POST'],
      maxResponseBytes: 262144,
      timeoutMs: 15000,
    });
  });

  it('配置文件的非字符串项被过滤，方法与上限取默认', async () => {
    writeFileSync(policyFile(), JSON.stringify({ allowedHosts: ['good.com', 5, '', 'b.com'] }), 'utf-8');
    await register();
    const get = state.handlers.get(IPC.plugin.netGetPolicy)!;
    expect(get(null)).toEqual(
      expect.objectContaining({ allowedHosts: ['good.com', 'b.com'], allowedMethods: ['GET', 'POST'] }),
    );
  });

  it('损坏配置文件回退默认策略', async () => {
    writeFileSync(policyFile(), 'not json', 'utf-8');
    await register();
    const get = state.handlers.get(IPC.plugin.netGetPolicy)!;
    expect(get(null).allowedHosts).toEqual([]);
  });

  it('set-policy 校验入参、写盘并内存生效', async () => {
    await register();
    const set = state.handlers.get(IPC.plugin.netSetPolicy)!;
    expect(() => set(null, null)).toThrow(TypeError);
    expect(() => set(null, { allowedHosts: 'nope' })).toThrow(TypeError);

    expect(set(null, { allowedHosts: ['a.com'] })).toEqual({ ok: true });

    const get = state.handlers.get(IPC.plugin.netGetPolicy)!;
    expect(get(null)).toEqual(
      expect.objectContaining({ allowedHosts: ['a.com'], allowedMethods: ['GET', 'POST'] }),
    );
    expect(readFileSync(policyFile(), 'utf-8')).toBe('{"allowedHosts":["a.com"]}');

    // 写盘后再次读取走缓存：手改文件不影响内存策略
    writeFileSync(policyFile(), JSON.stringify({ allowedHosts: ['changed.com'] }), 'utf-8');
    expect(get(null).allowedHosts).toEqual(['a.com']);
  });

  it('写盘失败不阻断内存生效，记 warn', async () => {
    await register();
    const target = join(state.userData, 'blocked');
    writeFileSync(target, 'x', 'utf-8');
    state.userData = target;
    const set = state.handlers.get(IPC.plugin.netSetPolicy)!;
    expect(set(null, { allowedHosts: ['a.com'] })).toEqual({ ok: true });
    expect(state.warn).toHaveBeenCalled();
  });

  it('net-fetch 校验入参并按策略代理', async () => {
    await register();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const fetchHandler = state.handlers.get(IPC.plugin.netFetch)!;

    expect(() => fetchHandler(null, null)).toThrow(TypeError);
    expect(() => fetchHandler(null, { url: 5 })).toThrow(TypeError);

    // 未配置白名单：默认拒绝
    await expect(fetchHandler(null, { url: 'https://a.com' })).resolves.toEqual({
      ok: false,
      error: expect.any(String),
    });

    state.handlers.get(IPC.plugin.netSetPolicy)!(null, { allowedHosts: ['a.com'] });
    await expect(fetchHandler(null, { url: 'https://a.com' })).resolves.toEqual({ ok: true, status: 200, text: 'ok' });
  });
});
