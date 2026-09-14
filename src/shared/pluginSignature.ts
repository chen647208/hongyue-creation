/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件签名信封（跨层单源）。校验在主进程（`main/app/pluginSignature.ts`）。
 *
 * - `ed25519`：detached 签名 + PEM 公钥（须命中信任键白名单）；提供来源认证。
 * - `sha256`：内容摘要；仅完整性，不提供来源认证，故不放开可执行贡献。
 * - `cosign`：Sigstore/cosign 签名 + 证书；由主进程调用外部 cosign 校验。
 */

export interface Ed25519SignatureEnvelope {
  algorithm: 'ed25519';
  signature: string;
  publicKey: string;
}

export interface Sha256SignatureEnvelope {
  algorithm: 'sha256';
  digest: string;
}

export interface CosignSignatureEnvelope {
  algorithm: 'cosign';
  /** cosign bundle（JSON）的 base64；含签名，keyless 时还含证书与 Rekor 凭据。 */
  bundle: string;
  /** key 模式：验证用公钥（PEM）。与 certificateIdentity 二选一。 */
  publicKey?: string;
  /** keyless 模式：期望的证书身份（`--certificate-identity`）。 */
  certificateIdentity?: string;
  /** keyless 模式：期望的 OIDC 签发方（`--certificate-oidc-issuer`）。 */
  certificateOidcIssuer?: string;
}

export type PluginSignatureEnvelope = Ed25519SignatureEnvelope | Sha256SignatureEnvelope | CosignSignatureEnvelope;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** 解析签名信封；算法未知或缺必要字段返回 undefined。 */
export function parseSignatureEnvelope(raw: string): PluginSignatureEnvelope | undefined {
  try {
    return validateSignatureEnvelope(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

/** 校验一个已解析的签名信封对象；算法未知或缺必要字段返回 undefined。 */
export function validateSignatureEnvelope(value: unknown): PluginSignatureEnvelope | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const parsed = value as Record<string, unknown>;
  switch (parsed.algorithm) {
    case 'ed25519':
      if (!isNonEmptyString(parsed.signature) || !isNonEmptyString(parsed.publicKey)) return undefined;
      return { algorithm: 'ed25519', signature: parsed.signature, publicKey: parsed.publicKey };
    case 'sha256':
      if (!isNonEmptyString(parsed.digest)) return undefined;
      return { algorithm: 'sha256', digest: parsed.digest };
    case 'cosign':
      if (!isNonEmptyString(parsed.bundle)) return undefined;
      return {
        algorithm: 'cosign',
        bundle: parsed.bundle,
        publicKey: isNonEmptyString(parsed.publicKey) ? parsed.publicKey : undefined,
        certificateIdentity: isNonEmptyString(parsed.certificateIdentity) ? parsed.certificateIdentity : undefined,
        certificateOidcIssuer: isNonEmptyString(parsed.certificateOidcIssuer) ? parsed.certificateOidcIssuer : undefined,
      };
    default:
      return undefined;
  }
}
