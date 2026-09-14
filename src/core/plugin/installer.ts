/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件安装/更新/卸载编排（docs/design/40 §1）。
 *
 * 本层只编排流程与安全门，不触达文件系统：包读取、签名校验、摘要比对、原子落盘、
 * 卸载清理都由 `PluginInstallPort` 提供。顺序为「读取 → manifest 校验 → 来源白名单
 * → host 区间 → 签名/摘要 → 版本决策 → 原子提交」，任一步失败即拒装，不产生半成品。
 *
 * 卸载先移除落盘文件，再清理插件配置与缓存；宿主贡献由 PluginHost.uninstall 逆序释放，
 * 两者合起来保证无残留。
 */
import type { PluginSignatureEnvelope } from '../../shared/pluginSignature.js';
import { compareSemver } from './catalog.js';
import { type ManifestIssue, satisfiesRange, validateManifest } from './manifest.js';

/** 一个已读取的插件包（manifest 原文 + 解析值 + 资源）。 */
export interface PluginPackage {
  /** 包在磁盘上的位置（目录）；提交时按它原样复制，保留二进制资源。 */
  source: string;
  /** plugin.json 原始字节（按 UTF-8 解码）；签名与摘要以此为准。 */
  manifestText: string;
  manifestJson: unknown;
  signature?: PluginSignatureEnvelope;
  /** 相对路径 → 文本内容（二进制以 base64 由端口自行标记约定）。 */
  files: Record<string, string>;
}

/** 安装端口：真实实现走 node fs + 主进程签名校验；测试用内存实现。 */
export interface PluginInstallPort {
  readPackage(source: string): Promise<PluginPackage>;
  /** 校验包来源签名；algorithm 为 sha256 时按摘要处理。 */
  verifySignature(manifestText: string, envelope: PluginSignatureEnvelope): Promise<boolean>;
  digestMatches(manifestText: string, digest: string): Promise<boolean>;
  readInstalledVersion(pluginId: string): Promise<string | undefined>;
  /** 原子写入 plugins/<id>；失败必须回滚到调用前状态。 */
  commit(pkg: PluginPackage): Promise<void>;
  /** 递归移除插件目录。 */
  remove(pluginId: string): Promise<void>;
  /** 清理插件配置与缓存（如 plugin.<id>.* 键）。 */
  clearState(pluginId: string): Promise<void>;
}

export interface InstallOptions {
  allowedSources?: readonly string[];
  hostVersion: string;
  /** 目录索引给出的期望摘要；给出时必须命中。 */
  expectedDigest?: string;
  /** 要求来源认证签名（可执行贡献强制；默认 false）。 */
  requireSignature?: boolean;
}

export interface InstallResult {
  ok: boolean;
  pluginId?: string;
  version?: string;
  action?: 'install' | 'update' | 'up-to-date';
  reason?: string;
}

function issueText(issues: ManifestIssue[]): string {
  return issues.map((i) => `${i.path || '<root>'}: ${i.message}`).join('; ');
}

function failure(reason: string): InstallResult {
  return { ok: false, reason };
}

/** 安装或更新一个插件包：所有安全门通过后才落盘。 */
export async function installPackage(
  port: PluginInstallPort,
  source: string,
  options: InstallOptions,
): Promise<InstallResult> {
  let pkg: PluginPackage;
  try {
    pkg = await port.readPackage(source);
  } catch (error) {
    return failure(`读取插件包失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const validated = validateManifest(pkg.manifestJson);
  if (!validated.ok) return failure(`manifest 校验失败：${issueText(validated.issues)}`);
  const manifest = validated.manifest;

  // 来源白名单：非空即拒绝清单外来源（默认拒绝未知来源）。
  const allowedSources = options.allowedSources ?? [];
  const declaredSource = typeof (pkg.manifestJson as { source?: unknown }).source === 'string'
    ? (pkg.manifestJson as { source: string }).source
    : undefined;
  if (allowedSources.length > 0 && (!declaredSource || !allowedSources.includes(declaredSource))) {
    return failure(`来源不在白名单：${declaredSource ?? '未声明 source'}`);
  }

  // host 兼容区间。
  if (!satisfiesRange(options.hostVersion, manifest.host)) {
    return failure(`宿主版本 ${options.hostVersion} 不满足插件要求 ${manifest.host}`);
  }

  // 可执行贡献（logic/editor）必须来源认证，避免未签名代码进入沙箱。
  const executable = (manifest.contributes?.logic?.length ?? 0) > 0
    || (manifest.contributes?.editor?.length ?? 0) > 0;
  const requireSignature = options.requireSignature === true || executable;

  if (pkg.signature) {
    const verified = await port.verifySignature(pkg.manifestText, pkg.signature);
    if (!verified) return failure('插件签名校验失败（包被篡改或公钥不受信任）');
  } else if (requireSignature) {
    return failure('缺少签名：可执行贡献或强制签名要求的插件必须带 plugin.sig');
  }

  // 摘要：目录索引给出的期望值或包内 sha256 信封，命中即视为未被篡改。
  if (options.expectedDigest) {
    const matched = await port.digestMatches(pkg.manifestText, options.expectedDigest);
    if (!matched) return failure('插件摘要不匹配（包被篡改）');
  } else if (pkg.signature?.algorithm === 'sha256') {
    const matched = await port.digestMatches(pkg.manifestText, pkg.signature.digest);
    if (!matched) return failure('插件摘要不匹配（包被篡改）');
  }

  // 版本决策：无本地版本=安装；更高=更新；同版本=已完成；更低=拒绝降级。
  const current = await port.readInstalledVersion(manifest.id);
  if (current !== undefined) {
    const cmp = compareSemver(manifest.version, current);
    if (cmp === 0) return { ok: true, pluginId: manifest.id, version: manifest.version, action: 'up-to-date' };
    if (cmp < 0) return failure(`已安装更高版本 ${current}，拒绝降级到 ${manifest.version}`);
  }

  try {
    await port.commit(pkg);
  } catch (error) {
    return failure(`落盘失败（已回滚）：${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    ok: true,
    pluginId: manifest.id,
    version: manifest.version,
    action: current === undefined ? 'install' : 'update',
  };
}

export interface UninstallResult {
  ok: boolean;
  pluginId: string;
  reason?: string;
}

/** 卸载：先删文件，再清配置与缓存；任一步失败上报，不静默吞错。 */
export async function uninstallPackage(port: PluginInstallPort, pluginId: string): Promise<UninstallResult> {
  try {
    await port.remove(pluginId);
    await port.clearState(pluginId);
    return { ok: true, pluginId };
  } catch (error) {
    return { ok: false, pluginId, reason: error instanceof Error ? error.message : String(error) };
  }
}
