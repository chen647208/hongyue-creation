/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  setProxy: vi.fn(),
  apply: vi.fn(),
  rules: vi.fn(),
  test: vi.fn(),
  parse: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any): void => {
      state.handlers.set(channel, fn);
    },
  },
  session: { defaultSession: { setProxy: state.setProxy } },
}));

vi.mock('../../logger.js', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() },
}));

vi.mock('../proxy.js', () => ({
  parseProxyUrl: state.parse,
  applyProxyConfig: state.apply,
  buildChromiumProxyRules: state.rules,
  testProxy: state.test,
}));

import { IPC } from '../../channels.js';
import { registerProxyIpc } from '../proxyIpc.js';

describe('registerProxyIpc（代理下发与测试）', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.setProxy.mockReset().mockResolvedValue(undefined);
    state.apply.mockReset();
    state.rules.mockReset().mockReturnValue({ mode: 'fixed_servers' });
    state.test.mockReset().mockResolvedValue({ ok: true });
    state.parse.mockReset().mockReturnValue({ ok: true, url: 'http://127.0.0.1:7890' });
    state.warn.mockClear();
    registerProxyIpc();
  });

  it('注册 set-proxy 与 test-proxy 两个通道', () => {
    expect(state.handlers.has(IPC.net.setProxy)).toBe(true);
    expect(state.handlers.has(IPC.net.testProxy)).toBe(true);
  });

  it('set-proxy 拒绝非字符串与非法的代理地址', async () => {
    const setProxy = state.handlers.get(IPC.net.setProxy)!;
    await expect(setProxy(null, 5)).rejects.toThrow(TypeError);

    state.parse.mockReturnValue({ ok: false, error: 'bad-scheme' });
    await expect(setProxy(null, 'ftp://x')).rejects.toThrow('非法代理地址：bad-scheme');
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('set-proxy 合法地址双覆盖（网关 + Chromium）', async () => {
    const setProxy = state.handlers.get(IPC.net.setProxy)!;
    await expect(setProxy(null, 'http://127.0.0.1:7890')).resolves.toEqual({ ok: true });
    expect(state.apply).toHaveBeenCalledWith('http://127.0.0.1:7890');
    expect(state.rules).toHaveBeenCalledWith('http://127.0.0.1:7890');
    expect(state.setProxy).toHaveBeenCalledWith({ mode: 'fixed_servers' });
  });

  it('Chromium 代理失败只记 warn，网关侧仍返回成功', async () => {
    state.setProxy.mockRejectedValue(new Error('session gone'));
    const setProxy = state.handlers.get(IPC.net.setProxy)!;
    await expect(setProxy(null, 'http://127.0.0.1:7890')).resolves.toEqual({ ok: true });
    expect(state.warn).toHaveBeenCalled();
  });

  it('test-proxy 拒绝非字符串并透传测试结果', async () => {
    const testProxy = state.handlers.get(IPC.net.testProxy)!;
    await expect(testProxy(null, 5)).rejects.toThrow(TypeError);
    await expect(testProxy(null, 'http://127.0.0.1:7890')).resolves.toEqual({ ok: true });
    expect(state.test).toHaveBeenCalledWith('http://127.0.0.1:7890');
  });
});
