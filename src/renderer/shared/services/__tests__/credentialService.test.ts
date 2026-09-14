/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { isVaultRef,VAULT_REF_PREFIX } from '@shared/constants/vault';
import { beforeEach,describe, expect, it, vi } from 'vitest';

import {
  isVaultAvailable,
  persistApiKey,
  removeApiKey,
} from '../credentialService';

function stubVault(impl?: Partial<{ isAvailable: boolean; store: Map<string, string> }>): Map<string, string> {
  const store = impl?.store ?? new Map<string, string>();
  const available = impl?.isAvailable ?? true;
  vi.stubGlobal('window', {
    electronAPI: {
      vault: {
        isAvailable: async () => available,
        set: async (id: string, plaintext: string) => {
          if (!available) throw new Error('VAULT_UNAVAILABLE');
          store.set(id, plaintext);
          return true;
        },
        get: async (id: string) => store.get(id) ?? null,
        remove: async (id: string) => {
          store.delete(id);
          return true;
        },
      },
    },
  });
  return store;
}

describe('credentialService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('isVaultRef 判定', () => {
    expect(isVaultRef(`${VAULT_REF_PREFIX}m1`)).toBe(true);
    expect(isVaultRef('sk-x')).toBe(false);
    expect(isVaultRef(undefined)).toBe(false);
  });

  it('vault 可用：persist 入库返回引用', async () => {
    const store = stubVault();
    expect(await isVaultAvailable()).toBe(true);
    const { stored, encrypted } = await persistApiKey('m1', 'sk-secret');
    expect(stored).toBe(`${VAULT_REF_PREFIX}m1`);
    expect(encrypted).toBe(true);
    expect(store.get('m1')).toBe('sk-secret');
    // 已是引用不再重复入库
    const again = await persistApiKey('m1', stored);
    expect(again.stored).toBe(stored);
    await removeApiKey('m1');
    expect(store.has('m1')).toBe(false);
  });

  it('空值：persist 返回 undefined（加密视为真，不误报）', async () => {
    stubVault();
    expect(await persistApiKey('m1', undefined)).toEqual({ stored: undefined, encrypted: true });
    expect(await persistApiKey('m1', '')).toEqual({ stored: undefined, encrypted: true });
  });

  it('vault 不可用：明文回落 + encrypted=false，调用方据此提示', async () => {
    stubVault({ isAvailable: false });
    expect(await isVaultAvailable()).toBe(false);
    const { stored, encrypted } = await persistApiKey('m1', 'sk-x');
    expect(stored).toBe('sk-x');
    expect(encrypted).toBe(false);
  });

  it('无 electronAPI（浏览器预览）：明文回落且不抛错', async () => {
    vi.stubGlobal('window', {});
    const { stored, encrypted } = await persistApiKey('m1', 'sk-x');
    expect(stored).toBe('sk-x');
    expect(encrypted).toBe(false);
    await removeApiKey('m1');
  });
});
