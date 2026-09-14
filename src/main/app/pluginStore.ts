/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件安装落盘（docs/design/40 §1）：node fs 端口 + 安全门。
 *
 * 读取包 → 校验 manifest/来源/host/签名/摘要（installer 编排）→ 原子提交。
 * 提交用「暂存目录 → 备份旧版本 → 改名替换」三步，任一步失败回滚到旧版本，
 * 不留半成品。卸载递归删除插件目录。
 *
 * 本模块不依赖 electron，便于单测；IPC 注册见 `pluginStoreIpc.ts`。
 */
import { cp, mkdir, readdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  type InstallOptions,
  installPackage,
  type InstallResult,
  type PluginInstallPort,
  type PluginPackage,
  uninstallPackage,
  type UninstallResult,
} from '../../core/plugin/installer.js';
import { parseSignatureEnvelope } from '../../shared/pluginSignature.js';
import { sha256Matches, verifyCosignBlob, verifyEd25519 } from './pluginSignature.js';

export interface PluginStoreOptions {
  /** 插件落盘根目录（通常 userData/plugins）。 */
  pluginsRoot: string;
  /** 信任公钥判定（主进程持清单）。 */
  isTrustedKey: (publicKeyPem: string) => boolean;
}

async function exists(target: string): Promise<boolean> {
  try {
    await readdir(target);
    return true;
  } catch {
    return false;
  }
}

/** 目录内是否存在 plugin.json 的插件包。 */
export async function isPluginPackageDir(dir: string): Promise<boolean> {
  try {
    await readFile(path.join(dir, 'plugin.json'), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** 创建 node fs 安装端口。 */
export function createFsInstallPort(options: PluginStoreOptions): PluginInstallPort {
  const root = path.resolve(options.pluginsRoot);

  const targetDir = (pluginId: string): string => {
    if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(pluginId)) {
      throw new Error(`非法插件 id：${pluginId}`);
    }
    return path.join(root, pluginId);
  };

  return {
    async readPackage(source: string): Promise<PluginPackage> {
      const sourceDir = path.resolve(source);
      const manifestText = await readFile(path.join(sourceDir, 'plugin.json'), 'utf-8');
      const manifestJson = JSON.parse(manifestText) as unknown;
      let signature;
      try {
        signature = parseSignatureEnvelope(await readFile(path.join(sourceDir, 'plugin.sig'), 'utf-8'));
      } catch {
        signature = undefined;
      }
      return { source: sourceDir, manifestText, manifestJson, signature, files: {} };
    },

    async verifySignature(manifestText, envelope) {
      switch (envelope.algorithm) {
        case 'ed25519':
          return options.isTrustedKey(envelope.publicKey)
            && verifyEd25519(manifestText, envelope.signature, envelope.publicKey);
        case 'sha256':
          return sha256Matches(manifestText, envelope.digest);
        case 'cosign':
          return verifyCosignBlob(manifestText, {
            bundle: envelope.bundle,
            publicKey: envelope.publicKey,
            certificateIdentity: envelope.certificateIdentity,
            certificateOidcIssuer: envelope.certificateOidcIssuer,
          });
        default:
          return false;
      }
    },

    async digestMatches(manifestText, digest) {
      return sha256Matches(manifestText, digest);
    },

    async readInstalledVersion(pluginId) {
      try {
        const text = await readFile(path.join(targetDir(pluginId), 'plugin.json'), 'utf-8');
        const parsed = JSON.parse(text) as { version?: unknown };
        return typeof parsed.version === 'string' ? parsed.version : undefined;
      } catch {
        return undefined;
      }
    },

    async commit(pkg) {
      const id = (pkg.manifestJson as { id?: string }).id;
      if (typeof id !== 'string') throw new Error('插件包缺少 id');
      const target = targetDir(id);
      const staging = path.join(root, '.staging', `${id}-${Date.now()}`);
      const backup = path.join(root, '.backup', `${id}-${Date.now()}`);
      await mkdir(path.dirname(staging), { recursive: true });
      await mkdir(path.dirname(backup), { recursive: true });
      let movedToBackup = false;
      try {
        await rm(staging, { recursive: true, force: true });
        await cp(pkg.source, staging, { recursive: true });
        if (await exists(target)) {
          await rename(target, backup);
          movedToBackup = true;
        }
        await rename(staging, target);
        if (movedToBackup) await rm(backup, { recursive: true, force: true });
      } catch (error) {
        await rm(staging, { recursive: true, force: true });
        if (movedToBackup) {
          try {
            await rename(backup, target);
          } catch {
            // 回滚失败：保留备份目录，交给人工/日志排查
          }
        }
        throw error;
      }
    },

    async remove(pluginId) {
      await rm(targetDir(pluginId), { recursive: true, force: true });
    },

    async clearState() {
      // 主进程侧无插件配置缓存；配置在渲染层 localStorage（plugin.<id>.*），由渲染层清理。
    },
  };
}

/** 从磁盘目录安装/更新插件（校验签名与来源，失败不落盘）。 */
export async function installPluginFromDirectory(
  options: PluginStoreOptions,
  sourceDir: string,
  installOptions: Omit<InstallOptions, 'hostVersion'> & { hostVersion: string },
): Promise<InstallResult> {
  return installPackage(createFsInstallPort(options), sourceDir, installOptions);
}

/** 卸载已安装插件（递归删目录）。 */
export async function uninstallInstalledPlugin(
  options: PluginStoreOptions,
  pluginId: string,
): Promise<UninstallResult> {
  return uninstallPackage(createFsInstallPort(options), pluginId);
}

export interface InstalledPluginSummary {
  id: string;
  name?: string;
  version?: string;
  source?: string;
}

/** 列出已安装插件（跳过 .staging/.backup 等隐藏目录）。 */
export async function listInstalledPlugins(options: PluginStoreOptions): Promise<InstalledPluginSummary[]> {
  const entries = await readdir(path.resolve(options.pluginsRoot), { withFileTypes: true }).catch(() => []);
  const out: InstalledPluginSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      const text = await readFile(path.join(path.resolve(options.pluginsRoot), entry.name, 'plugin.json'), 'utf-8');
      const parsed = JSON.parse(text) as Record<string, unknown>;
      out.push({
        id: typeof parsed.id === 'string' ? parsed.id : entry.name,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        version: typeof parsed.version === 'string' ? parsed.version : undefined,
        source: typeof parsed.source === 'string' ? parsed.source : undefined,
      });
    } catch {
      // 损坏目录跳过
    }
  }
  return out;
}
