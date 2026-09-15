/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件目录索引（docs/design/40 §1）：列表/版本/摘要/签名/兼容 host 版本。
 *
 * 纯函数层：解析与校验索引、比较版本、给出安装决策。真正的包读取、签名校验与
 * 落盘由 installer 经端口完成；本层不触达文件系统与网络。
 */
import { type PluginSignatureEnvelope, validateSignatureEnvelope } from '../../shared/pluginSignature.js';
import {
  isReverseDomainId,
  isSemver,
  isVersionRange,
  type ManifestIssue,
  satisfiesRange,
} from './manifest.js';

/** 目录索引中的一条可安装项。 */
export interface PluginCatalogEntry {
  id: string;
  name: string;
  version: string;
  /** 兼容的宿主版本区间（如 ^2.0.0）。 */
  host: string;
  license: string;
  /** 来源标识：非空时参与来源白名单校验。 */
  source: string;
  /** 包路径，相对于索引文件所在目录；只允许相对路径。 */
  path: string;
  /** plugin.json 字节的 sha256（base64）；有则安装前校验完整性。 */
  digest?: string;
  /** 包来源认证签名信封（复用三算法）。 */
  signature?: PluginSignatureEnvelope;
  description?: string;
}

export interface PluginCatalog {
  schema: 1;
  entries: PluginCatalogEntry[];
}

export type CatalogParseResult =
  | { ok: true; catalog: PluginCatalog }
  | { ok: false; issues: ManifestIssue[] };

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** 相对路径安全：非空、非绝对、无 `..` 段。 */
export function isSafeCatalogPath(value: string): boolean {
  if (!value) return false;
  if (value.startsWith('/') || value.startsWith('\\') || /^[a-zA-Z]:/.test(value)) return false;
  return !/(^|[\\/])\.\.([\\/]|$)/.test(value);
}

function validateEntry(raw: unknown, path: string, issues: ManifestIssue[]): void {
  const fail = (field: string, message: string): void => {
    issues.push({ path: path ? `${path}.${field}` : field, message });
  };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    issues.push({ path, message: '目录项必须是对象' });
    return;
  }
  const e = raw as Record<string, unknown>;
  if (!isNonEmpty(e.id)) fail('id', '缺失且必须是字符串');
  else if (!isReverseDomainId(e.id)) fail('id', `必须是反向域名，实际「${e.id}」`);
  if (!isNonEmpty(e.name)) fail('name', '缺失且必须是非空字符串');
  if (!isNonEmpty(e.version) || !isSemver(e.version)) fail('version', '必须是语义化版本（x.y.z）');
  if (!isNonEmpty(e.host) || !isVersionRange(e.host)) fail('host', '必须是版本区间（^x.y.z / ~x.y.z / x.y.z / *）');
  if (!isNonEmpty(e.license)) fail('license', '缺失：插件许可证');
  if (!isNonEmpty(e.source)) fail('source', '缺失：来源标识（来源白名单据此判定）');
  if (!isNonEmpty(e.path)) fail('path', '缺失：包路径');
  else if (!isSafeCatalogPath(e.path)) fail('path', '必须是索引文件所在目录内的相对路径（禁绝对路径与 ..）');
  if (e.digest !== undefined && !isNonEmpty(e.digest)) fail('digest', '给出时必须是 sha256（base64）字符串');
  if (e.description !== undefined && typeof e.description !== 'string') fail('description', '必须是字符串');
  if (e.signature !== undefined && !validateSignatureEnvelope(e.signature)) {
    fail('signature', '签名信封非法（algorithm 与必要字段不匹配）');
  }
}

/**
 * 索引验签端口：主进程按信任键清单验证整个索引 payload 的 detached 签名。
 * 与 installer 的包签名端口同形，测试注入内存实现即可，本层不触达 crypto。
 */
export interface CatalogSignatureVerifier {
  verifyPayload(payloadText: string, envelope: PluginSignatureEnvelope): Promise<boolean>;
}

/** 索引可用的来源认证算法：ed25519/cosign；sha256 仅完整性，不足以认证来源。 */
export function isIndexSignatureAlgorithm(algorithm: PluginSignatureEnvelope['algorithm']): boolean {
  return algorithm === 'ed25519' || algorithm === 'cosign';
}

/**
 * 校验整个索引 payload 的 detached 签名：通过返回 undefined，否则返回可读拒绝原因。
 * `requireSignature` 缺省为 true（fail-closed）：索引未带签名即拒绝使用。
 */
export async function verifyCatalogIndexSignature(
  payloadText: string,
  envelope: PluginSignatureEnvelope | undefined,
  verifier: CatalogSignatureVerifier | undefined,
  options: { requireSignature?: boolean } = {},
): Promise<string | undefined> {
  const requireSignature = options.requireSignature !== false;
  if (!envelope) {
    return requireSignature ? '索引缺少签名（catalog.sig 缺失）：拒绝使用未认证的目录索引' : undefined;
  }
  if (!isIndexSignatureAlgorithm(envelope.algorithm)) {
    return `索引签名算法 ${envelope.algorithm} 仅提供完整性，不能认证来源；请改用 ed25519 或 cosign`;
  }
  if (!verifier) return '索引验签端口缺失：无法校验索引签名，拒绝使用';
  const verified = await verifier.verifyPayload(payloadText, envelope);
  return verified ? undefined : '索引签名校验失败（索引被篡改或签名公钥不受信任）：拒绝使用';
}

export interface LoadCatalogOptions {
  /** 索引文件原文（catalog.json 字节）；detached 签名以它为准。 */
  payloadText: string;
  /** 分离签名信封（来自同级 catalog.sig）；缺省表示索引未签名。 */
  signature?: PluginSignatureEnvelope;
  /** 验签端口；缺省且要求签名时拒绝使用。 */
  verifier?: CatalogSignatureVerifier;
  /** 是否要求索引必须带来源认证签名；缺省 true。 */
  requireSignature?: boolean;
}

/** 解析目录索引；全部问题一次报出，带 JSON 路径。 */
export function parsePluginCatalog(raw: unknown): CatalogParseResult {
  const issues: ManifestIssue[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, issues: [{ path: '', message: '目录索引必须是 JSON 对象' }] };
  }
  const root = raw as Record<string, unknown>;
  if (root.schema !== undefined && root.schema !== 1) {
    issues.push({ path: 'schema', message: '仅支持 schema 1' });
  }
  if (!Array.isArray(root.entries)) {
    issues.push({ path: 'entries', message: '缺失且必须是数组' });
  } else {
    root.entries.forEach((entry, index) => validateEntry(entry, `entries[${index}]`, issues));
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, catalog: { schema: 1, entries: root.entries as PluginCatalogEntry[] } };
}

/**
 * 解析并校验目录索引：结构校验通过后，再校验整个 payload 的 detached 签名；
 * 验签失败即拒绝使用该索引（不返回任何条目）。
 */
export async function loadPluginCatalog(raw: unknown, options: LoadCatalogOptions): Promise<CatalogParseResult> {
  const parsed = parsePluginCatalog(raw);
  if (!parsed.ok) return parsed;
  const reason = await verifyCatalogIndexSignature(options.payloadText, options.signature, options.verifier, {
    requireSignature: options.requireSignature,
  });
  if (reason) return { ok: false, issues: [{ path: 'signature', message: reason }] };
  return parsed;
}

/** 解析语义化版本的数值三元组（忽略预发布/构建后缀）。 */
export function parseSemverParts(version: string): [number, number, number] {
  const cleaned = version.replace(/^[~^*]\s*/, '').split('-')[0] ?? version;
  const [a = '0', b = '0', c = '0'] = cleaned.split('.');
  return [Number(a) || 0, Number(b) || 0, Number(c) || 0];
}

/** 比较语义化版本：a>b 返回正数，a<b 返回负数，相等返回 0。 */
export function compareSemver(a: string, b: string): number {
  const left = parseSemverParts(a);
  const right = parseSemverParts(b);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface CatalogInstallContext {
  /** 来源白名单；非空时来源不在清单即拒装。 */
  allowedSources: readonly string[];
  /** 宿主版本（用于匹配条目的 host 区间）。 */
  hostVersion: string;
  /** 已安装版本；缺省表示未安装。 */
  currentVersion?: string;
}

export type CatalogInstallDecision =
  | { ok: true; action: 'install' | 'update' | 'up-to-date' }
  | { ok: false; reason: string };

/** 安装决策：来源白名单 → 宿主版本 → 版本升降级，逐层拦截。 */
export function decideCatalogInstall(
  entry: PluginCatalogEntry,
  ctx: CatalogInstallContext,
): CatalogInstallDecision {
  if (ctx.allowedSources.length > 0 && !ctx.allowedSources.includes(entry.source)) {
    return { ok: false, reason: `来源不在白名单：${entry.source}` };
  }
  if (!satisfiesRange(ctx.hostVersion, entry.host)) {
    return { ok: false, reason: `宿主版本 ${ctx.hostVersion} 不满足条目要求 ${entry.host}` };
  }
  if (ctx.currentVersion === undefined) return { ok: true, action: 'install' };
  const cmp = compareSemver(entry.version, ctx.currentVersion);
  if (cmp > 0) return { ok: true, action: 'update' };
  if (cmp === 0) return { ok: true, action: 'up-to-date' };
  return { ok: false, reason: `已安装更高版本 ${ctx.currentVersion}，拒绝降级到 ${entry.version}` };
}
