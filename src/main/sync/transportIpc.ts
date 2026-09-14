/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 同步传输 IPC（docs/design/36）：渲染层只下发配置与对象键，主进程从保险库
 * 解引用凭据后执行传输。失败原因可读；日志不落明文凭据。
 */
import { ipcMain } from 'electron';

import { isVaultRef, vaultIdFor } from '../../shared/constants/vault.js';
import type {
  SyncLocalTransportConfig,
  SyncS3TransportConfig,
  SyncTransportConfig,
  SyncWebDavTransportConfig,
} from '../../shared/types.js';
import { vaultGet } from '../app/secureStore.js';
import { IPC } from '../channels.js';
import { logger } from '../logger.js';
import { createTransport, type TransportSecrets } from './transport.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string') throw new TypeError(`传输配置字段 ${field} 必须是字符串`);
  return value;
}

function optionalString(source: Record<string, unknown>, field: string): string | undefined {
  const value = source[field];
  return typeof value === 'string' ? value : undefined;
}

/** 校验并收窄渲染层下发的传输配置（不信任 IPC 入参）。 */
function parseTransportConfig(raw: unknown): SyncTransportConfig {
  if (!isRecord(raw)) throw new TypeError('传输配置必须是对象');
  const kind = raw.kind;
  if (kind === 'local') {
    const config: SyncLocalTransportConfig = { kind: 'local', directory: requireString(raw, 'directory') };
    return config;
  }
  if (kind === 'webdav') {
    const authType = raw.authType;
    if (authType !== 'basic' && authType !== 'bearer' && authType !== 'none') {
      throw new TypeError('WebDAV 认证方式非法');
    }
    const config: SyncWebDavTransportConfig = {
      kind: 'webdav',
      baseUrl: requireString(raw, 'baseUrl'),
      authType,
      remoteDir: optionalString(raw, 'remoteDir'),
      username: optionalString(raw, 'username'),
      credentialRef: optionalString(raw, 'credentialRef'),
    };
    return config;
  }
  if (kind === 's3') {
    const config: SyncS3TransportConfig = {
      kind: 's3',
      endpoint: requireString(raw, 'endpoint'),
      region: requireString(raw, 'region'),
      bucket: requireString(raw, 'bucket'),
      prefix: optionalString(raw, 'prefix'),
      accessKeyId: requireString(raw, 'accessKeyId'),
      secretRef: optionalString(raw, 'secretRef'),
      pathStyle: raw.pathStyle === true,
    };
    return config;
  }
  throw new TypeError(`未知的传输类型：${String(kind)}`);
}

async function resolveSecrets(config: SyncTransportConfig): Promise<TransportSecrets> {
  const secrets: TransportSecrets = {};
  if (config.kind === 'webdav' && config.authType !== 'none') {
    const ref = config.credentialRef;
    if (!isVaultRef(ref)) throw new Error('WebDAV 凭据未保存到系统钥匙串，请先在设置中保存');
    const value = await vaultGet(vaultIdFor(ref));
    if (value === null) throw new Error('WebDAV 凭据缺失或无法解密，请在设置中重新保存');
    secrets.password = value;
  }
  if (config.kind === 's3') {
    const ref = config.secretRef;
    if (!isVaultRef(ref)) throw new Error('S3 Secret Access Key 未保存到系统钥匙串，请先在设置中保存');
    const value = await vaultGet(vaultIdFor(ref));
    if (value === null) throw new Error('S3 Secret Access Key 缺失或无法解密，请在设置中重新保存');
    secrets.secretAccessKey = value;
  }
  return secrets;
}

export function registerSyncIpc(): void {
  ipcMain.handle(IPC.sync.transportTest, async (_event, rawConfig: unknown) => {
    try {
      const config = parseTransportConfig(rawConfig);
      const secrets = await resolveSecrets(config);
      await createTransport(config, secrets).test();
      return { ok: true, message: '连接成功' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('sync', `传输连通测试失败：${message}`);
      return { ok: false, message };
    }
  });

  ipcMain.handle(IPC.sync.transportPut, async (_event, rawConfig: unknown, key: unknown, data: unknown) => {
    if (typeof key !== 'string' || typeof data !== 'string') {
      throw new TypeError('sync:transport:put 入参非法');
    }
    const config = parseTransportConfig(rawConfig);
    const secrets = await resolveSecrets(config);
    await createTransport(config, secrets).put(key, data);
    return { ok: true };
  });

  ipcMain.handle(IPC.sync.transportGet, async (_event, rawConfig: unknown, key: unknown) => {
    if (typeof key !== 'string') throw new TypeError('sync:transport:get 入参非法');
    const config = parseTransportConfig(rawConfig);
    const secrets = await resolveSecrets(config);
    return createTransport(config, secrets).get(key);
  });

  ipcMain.handle(IPC.sync.transportList, async (_event, rawConfig: unknown, prefix: unknown) => {
    if (prefix !== undefined && typeof prefix !== 'string') throw new TypeError('sync:transport:list 入参非法');
    const config = parseTransportConfig(rawConfig);
    const secrets = await resolveSecrets(config);
    return createTransport(config, secrets).list(prefix);
  });

  ipcMain.handle(IPC.sync.transportRemove, async (_event, rawConfig: unknown, key: unknown) => {
    if (typeof key !== 'string') throw new TypeError('sync:transport:remove 入参非法');
    const config = parseTransportConfig(rawConfig);
    const secrets = await resolveSecrets(config);
    await createTransport(config, secrets).remove(key);
    return { ok: true };
  });
}
