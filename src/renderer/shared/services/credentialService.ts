/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { isVaultRef,VAULT_REF_PREFIX } from '../../../shared/constants/vault';

/**
 * 渲染端凭证门面：持久化只存 `vault:<id>` 引用，明文只活在编辑态内存。
 *
 * - 保存时 persistApiKey 明文→vault:set→引用；vault 不可用（无钥匙串/浏览器预览）
 *   则原样返回明文并由调用方提示（绝不静默假装加密）；
 * - 拉表/测连/生成一律走主进程网关（`aiGateway.http`），由网关统一解引用，渲染端无需经手。
 */

export async function isVaultAvailable(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.electronAPI?.vault) return false;
    return await window.electronAPI.vault.isAvailable();
  } catch {
    return false;
  }
}

/** 明文入库：返回可持久化的值（引用或原文）与是否真正加密。 */
export async function persistApiKey(
  id: string,
  plaintext: string | undefined
): Promise<{ stored: string | undefined; encrypted: boolean }> {
  if (!plaintext) return { stored: undefined, encrypted: true };
  if (isVaultRef(plaintext)) return { stored: plaintext, encrypted: true };
  try {
    if (typeof window === 'undefined' || !window.electronAPI?.vault) {
      return { stored: plaintext, encrypted: false };
    }
    await window.electronAPI.vault.set(id, plaintext);
    return { stored: `${VAULT_REF_PREFIX}${id}`, encrypted: true };
  } catch {
    return { stored: plaintext, encrypted: false };
  }
}

export async function removeApiKey(id: string): Promise<void> {
  try {
    await window.electronAPI?.vault.remove(id);
  } catch {
    // 删除幂等：vault 不可用或无该 key 都视为成功
  }
}
