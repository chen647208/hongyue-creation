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

const state = vi.hoisted(() => ({ userData: '', warn: vi.fn() }));

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
}));

vi.mock('../../logger.js', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() },
}));

async function load() {
  return import('../pluginTrust.js');
}

const storeFile = (): string => join(state.userData, 'plugin-trusted-keys.json');

describe('pluginTrust（受信任插件公钥清单）', () => {
  beforeEach(() => {
    vi.resetModules();
    state.warn.mockClear();
    state.userData = mkdtempSync(join(tmpdir(), 'hy-trust-'));
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
  });

  it('文件缺失时清单为空', async () => {
    const { listTrustedPluginKeys, isTrustedPluginKey } = await load();
    expect(listTrustedPluginKeys()).toEqual([]);
    expect(isTrustedPluginKey('pem')).toBe(false);
  });

  it('设置时过滤空串与非字符串并落盘，随后可查询', async () => {
    const { setTrustedPluginKeys, listTrustedPluginKeys, isTrustedPluginKey } = await load();
    setTrustedPluginKeys(['k1', '', 5 as unknown as string, 'k2']);
    expect(listTrustedPluginKeys()).toEqual(['k1', 'k2']);
    expect(isTrustedPluginKey('k1')).toBe(true);
    expect(isTrustedPluginKey('missing')).toBe(false);
    expect(readFileSync(storeFile(), 'utf-8')).toBe('["k1","k2"]');
  });

  it('损坏文件回退空清单', async () => {
    writeFileSync(storeFile(), '{broken', 'utf-8');
    const { listTrustedPluginKeys } = await load();
    expect(listTrustedPluginKeys()).toEqual([]);
  });

  it('非数组内容回退空清单，数组内非字符串被过滤', async () => {
    writeFileSync(storeFile(), '{"a":1}', 'utf-8');
    let mod = await load();
    expect(mod.listTrustedPluginKeys()).toEqual([]);

    vi.resetModules();
    writeFileSync(storeFile(), '["ok", 7]', 'utf-8');
    mod = await load();
    expect(mod.listTrustedPluginKeys()).toEqual(['ok']);
  });

  it('写盘失败只记 warn，不抛出，内存仍生效', async () => {
    const { setTrustedPluginKeys, listTrustedPluginKeys } = await load();
    const target = join(state.userData, 'blocked');
    writeFileSync(target, 'x', 'utf-8');
    state.userData = target;
    expect(() => setTrustedPluginKeys(['k'])).not.toThrow();
    expect(state.warn).toHaveBeenCalled();
    expect(listTrustedPluginKeys()).toEqual(['k']);
  });
});
