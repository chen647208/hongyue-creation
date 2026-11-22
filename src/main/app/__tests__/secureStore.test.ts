/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach,describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  encAvailable: true,
  userData: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string): string => {
      if (name !== 'userData') throw new Error(`unexpected path: ${name}`);
      return state.userData;
    },
  },
  ipcMain: { handle: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: (): boolean => state.encAvailable,
    encryptString: (plain: string): Buffer => Buffer.from(`enc:${plain}`, 'utf-8'),
    decryptString: (buf: Buffer): string => {
      const s = buf.toString('utf-8');
      if (!s.startsWith('enc:')) throw new Error('decrypt failed');
      return s.slice('enc:'.length);
    },
  },
}));

import { isVaultRef,VAULT_REF_PREFIX,vaultIdFor } from '../../../shared/constants/vault.js';
import type { ModelConfig } from '../../../shared/types.js';
import {
  isVaultAvailable,
  resolveVaultApiKey,
  VAULT_UNAVAILABLE,
  vaultGet,
  vaultRemove,
  vaultSet,
  withVaultKey,
} from '../secureStore.js';

if (!state.userData) {
  state.userData = mkdtempSync(join(tmpdir(), 'vault-test-'));
}

const model = (over: Partial<ModelConfig> = {}): ModelConfig =>
  ({ id: 'm1', name: 'M', providerId: 'p1', provider: 'openai-chat', endpoint: 'https://x/v1', modelName: 'm', ...over });

describe('vault 引用', () => {
  it('isVaultRef/vaultIdFor', () => {
    expect(isVaultRef(`${VAULT_REF_PREFIX}m1`)).toBe(true);
    expect(isVaultRef('sk-plain')).toBe(false);
    expect(isVaultRef('vault:')).toBe(false);
    expect(isVaultRef(undefined)).toBe(false);
    expect(vaultIdFor(`${VAULT_REF_PREFIX}m1`)).toBe('m1');
  });
});

describe('vault 不可用时显式失败（不静默降级）', () => {
  beforeEach(() => {
    state.encAvailable = false;
  });

  it('isVaultAvailable=false，set 抛 VAULT_UNAVAILABLE，get 返回 null', async () => {
    expect(isVaultAvailable()).toBe(false);
    await expect(vaultSet('k', 'sk-x')).rejects.toThrow(VAULT_UNAVAILABLE);
    expect(await vaultGet('k')).toBeNull();
  });
});

describe('vault 可用时往返', () => {
  beforeEach(() => {
    state.encAvailable = true;
  });

  it('set/get/remove 闭环；落盘为密文', async () => {
    await vaultSet('m1', 'sk-secret');
    expect(await vaultGet('m1')).toBe('sk-secret');
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(join(state.userData, 'vault.json'), 'utf-8');
    expect(raw).not.toContain('sk-secret');
    await vaultRemove('m1');
    expect(await vaultGet('m1')).toBeNull();
  });

  it('resolveVaultApiKey：明文透传/引用解析/缺失→undefined', async () => {
    expect(await resolveVaultApiKey('sk-plain')).toBe('sk-plain');
    expect(await resolveVaultApiKey(undefined)).toBeUndefined();
    await vaultSet('m2', 'sk-2');
    expect(await resolveVaultApiKey(`${VAULT_REF_PREFIX}m2`)).toBe('sk-2');
    expect(await resolveVaultApiKey(`${VAULT_REF_PREFIX}lost`)).toBeUndefined();
  });

  it('withVaultKey：网关统一解引用', async () => {

    await vaultSet('m3', 'sk-3');
    const ok = await withVaultKey(model({ apiKey: `${VAULT_REF_PREFIX}m3` }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.model.apiKey).toBe('sk-3');
    const missing = await withVaultKey(model({ apiKey: `${VAULT_REF_PREFIX}lost` }));
    expect(missing.ok).toBe(false);
    const plain = await withVaultKey(model({ apiKey: 'sk-plain' }));
    expect(plain.ok).toBe(true);
    if (plain.ok) expect(plain.model.apiKey).toBe('sk-plain');
  });

  it('损坏的 vault.json：读失败记日志，get 返回 null 不抛错', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const file = join(state.userData, 'vault.json');
    await writeFile(file, '{broken json', 'utf-8');
    try {
      expect(await vaultGet('m1')).toBeNull();
    } finally {
      await unlink(file).catch(() => undefined);
    }
    expect(await vaultGet('m1')).toBeNull();
  });
});
