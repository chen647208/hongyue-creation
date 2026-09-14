/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 同步传输（渲染层服务）：配置与密钥分离——非密钥配置存 localStorage，
 * 密钥经 vault.set 存系统钥匙串，配置只保留 `vault:<id>` 引用。
 * 收发一律经主进程 IPC（renderer 不直连网络/文件系统）。
 */
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import type { SyncTransportConfig, SyncTransportTestResult } from '@shared/types';

import { localStore } from './localStore';

/** 保险库 id：每个后端一个固定槽位，重存即覆盖。 */
export const SYNC_SECRET_IDS = {
  webdav: 'sync.webdav',
  s3: 'sync.s3',
} as const;

export function defaultSyncTransportConfig(): SyncTransportConfig {
  return { kind: 'local', directory: '' };
}

function isTransportConfig(value: unknown): value is SyncTransportConfig {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'local' || kind === 'webdav' || kind === 's3';
}

export function loadSyncTransportConfig(): SyncTransportConfig {
  const raw = localStore.getItem(STORAGE_KEYS.syncTransport);
  if (!raw) return defaultSyncTransportConfig();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isTransportConfig(parsed) ? parsed : defaultSyncTransportConfig();
  } catch {
    return defaultSyncTransportConfig();
  }
}

export function saveSyncTransportConfig(config: SyncTransportConfig): void {
  localStore.setItem(STORAGE_KEYS.syncTransport, JSON.stringify(config));
}

function api(): NonNullable<Window['electronAPI']> {
  const value = typeof window === 'undefined' ? undefined : window.electronAPI;
  if (!value?.sync) throw new Error('同步传输仅桌面端可用');
  return value;
}

/** 存密钥并返回可直接写入配置的引用；明文不落配置。 */
export async function storeSyncTransportSecret(id: string, secret: string): Promise<string> {
  await api().vault.set(id, secret);
  return `vault:${id}`;
}

/** 连通测试：返回可读结果，不抛错；桌面端缺失时给出提示。 */
export async function testSyncTransport(config: SyncTransportConfig): Promise<SyncTransportTestResult> {
  const value = typeof window === 'undefined' ? undefined : window.electronAPI;
  if (!value?.sync) return { ok: false, message: '同步传输仅桌面端可用' };
  return value.sync.testTransport(config);
}

export interface RetryOptions {
  /** 总尝试次数（含首次），默认 3。 */
  maxAttempts?: number;
  /** 首次重试等待毫秒，后续线性递增，默认 400。 */
  delayMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 有限次重试：失败按线性退避重试，耗尽后抛最后一次错误。 */
export async function retryAsync<T>(run: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelay = options.delayMs ?? 400;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await delay(baseDelay * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function putSyncObject(
  config: SyncTransportConfig,
  key: string,
  data: string,
  options?: RetryOptions,
): Promise<void> {
  const target = api();
  await retryAsync(() => target.sync.put(config, key, data), options);
}

export async function getSyncObject(
  config: SyncTransportConfig,
  key: string,
  options?: RetryOptions,
): Promise<string | null> {
  const target = api();
  return retryAsync(() => target.sync.get(config, key), options);
}
