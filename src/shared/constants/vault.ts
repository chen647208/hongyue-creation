/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 保险库引用前缀与判定（主进程与渲染层共用单源）。
 * 凭据在配置里只存 `vault:<id>` 引用，明文只存在于系统钥匙串。
 */
export const VAULT_REF_PREFIX = 'vault:';

export function isVaultRef(value: string | undefined): value is string {
  return typeof value === 'string' && value.startsWith(VAULT_REF_PREFIX) && value.length > VAULT_REF_PREFIX.length;
}

export function vaultIdFor(ref: string): string {
  return ref.slice(VAULT_REF_PREFIX.length);
}
