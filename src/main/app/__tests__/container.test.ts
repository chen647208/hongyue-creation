/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AppContainer, type Provider } from '../container.js';

function ctx() {
  return { getMainWindow: () => null };
}

describe('AppContainer（Provider 容器）', () => {
  it('register 链式返回自身', () => {
    const container = new AppContainer();
    const provider: Provider = { name: 'p', boot: vi.fn() };
    expect(container.register(provider)).toBe(container);
  });

  it('boot 按注册序串行 await', async () => {
    const calls: string[] = [];
    const first: Provider = {
      name: 'a',
      boot: async () => {
        await Promise.resolve();
        calls.push('a');
      },
    };
    const second: Provider = { name: 'b', boot: () => void calls.push('b') };
    const container = new AppContainer().register(first).register(second);
    await container.boot(ctx());
    expect(calls).toEqual(['a', 'b']);
  });

  it('boot 首个失败即抛出，后续 Provider 不启动', async () => {
    const after = vi.fn();
    const bad: Provider = {
      name: 'bad',
      boot: async () => {
        throw new Error('boom');
      },
    };
    const later: Provider = { name: 'later', boot: after };
    const container = new AppContainer().register(bad).register(later);
    await expect(container.boot(ctx())).rejects.toThrow('boom');
    expect(after).not.toHaveBeenCalled();
  });

  it('shutdown 逆序执行，单点失败不阻断其余，无 shutdown 的 Provider 跳过', async () => {
    const order: string[] = [];
    const a: Provider = { name: 'a', boot: vi.fn(), shutdown: () => void order.push('a') };
    const b: Provider = {
      name: 'b',
      boot: vi.fn(),
      shutdown: () => {
        order.push('b');
        throw new Error('shutdown failed');
      },
    };
    const c: Provider = { name: 'c', boot: vi.fn() };
    const container = new AppContainer().register(a).register(b).register(c);
    await container.shutdown(ctx());
    expect(order).toEqual(['b', 'a']);
  });
});
