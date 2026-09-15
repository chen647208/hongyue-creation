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
import { SYNC_CHUNK_MANIFEST_SUFFIX, SYNC_CHUNK_PART_INFIX } from '@shared/constants/sync';
import { VAULT_REF_PREFIX } from '@shared/constants/vault';
import type { SyncTransportConfig, SyncTransportObject, SyncTransportTestResult } from '@shared/types';

import { localStore } from './localStore';
import { type BrowserTransportSecrets, createBrowserTransport, getChunkedBrowser, putChunkedBrowser, removeChunkedBrowser } from './syncTransportBrowser';

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

/** 配置是否完整到可收发（本地目录非空 / WebDAV 地址 + 认证 / S3 五项齐全）。 */
export function isTransportReady(config: SyncTransportConfig | null): boolean {
  if (!config) return false;
  if (config.kind === 'local') return !!config.directory.trim();
  if (config.kind === 'webdav') return !!config.baseUrl.trim() && (config.authType === 'none' || !!config.credentialRef);
  return !!config.endpoint.trim() && !!config.bucket.trim() && !!config.accessKeyId.trim() && !!config.secretRef;
}

/** 浏览器端无系统钥匙串：密钥暂存 localStorage（同设备同浏览器可见，明文，仅在浏览器预览/PWA 生效）。 */
function readBrowserSecrets(): Record<string, string> {
  const raw = localStore.getItem(STORAGE_KEYS.syncSecrets);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function browserSecretFor(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const id = ref.startsWith(VAULT_REF_PREFIX) ? ref.slice(VAULT_REF_PREFIX.length) : ref;
  return readBrowserSecrets()[id];
}

function browserSecretsFor(config: SyncTransportConfig): BrowserTransportSecrets {
  if (config.kind === 'webdav') return { password: browserSecretFor(config.credentialRef) };
  if (config.kind === 's3') return { secretAccessKey: browserSecretFor(config.secretRef) };
  return {};
}

/** 传输操作接缝：桌面走主进程 IPC（分片在主进程完成），浏览器用 fetch 直连并本地分片。 */
interface SyncTransportApi {
  test(config: SyncTransportConfig): Promise<SyncTransportTestResult>;
  putChunked(config: SyncTransportConfig, key: string, data: string): Promise<void>;
  getChunked(config: SyncTransportConfig, key: string): Promise<string | null>;
  list(config: SyncTransportConfig, prefix?: string): Promise<SyncTransportObject[]>;
  remove(config: SyncTransportConfig, key: string): Promise<void>;
}

function desktopTransportApi(target: NonNullable<Window['electronAPI']>): SyncTransportApi {
  return {
    test: (config) => target.sync.testTransport(config),
    putChunked: (config, key, data) => target.sync.putChunked(config, key, data).then(() => undefined),
    getChunked: (config, key) => target.sync.getChunked(config, key),
    list: (config, prefix) => target.sync.list(config, prefix),
    remove: (config, key) => target.sync.remove(config, key).then(() => undefined),
  };
}

function browserTransportApi(): SyncTransportApi {
  return {
    async test(config) {
      try {
        await createBrowserTransport(config, browserSecretsFor(config)).test();
        return { ok: true, message: '' };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
    putChunked: async (config, key, data) => {
      await putChunkedBrowser(createBrowserTransport(config, browserSecretsFor(config)), key, data);
    },
    getChunked: (config, key) => getChunkedBrowser(createBrowserTransport(config, browserSecretsFor(config)), key),
    list: (config, prefix) => createBrowserTransport(config, browserSecretsFor(config)).list(prefix),
    remove: (config, key) => removeChunkedBrowser(createBrowserTransport(config, browserSecretsFor(config)), key),
  };
}

function transportApi(): SyncTransportApi {
  const value = typeof window === 'undefined' ? undefined : window.electronAPI;
  return value?.sync ? desktopTransportApi(value) : browserTransportApi();
}

/** 存密钥并返回可直接写入配置的引用；桌面走系统钥匙串，浏览器落 localStorage。 */
export async function storeSyncTransportSecret(id: string, secret: string): Promise<string> {
  const vault = typeof window === 'undefined' ? undefined : window.electronAPI?.vault;
  if (vault) {
    await vault.set(id, secret);
    return `${VAULT_REF_PREFIX}${id}`;
  }
  const map = readBrowserSecrets();
  map[id] = secret;
  localStore.setItem(STORAGE_KEYS.syncSecrets, JSON.stringify(map));
  return `${VAULT_REF_PREFIX}${id}`;
}

/** 连通测试：返回可读结果，不抛错。 */
export async function testSyncTransport(config: SyncTransportConfig): Promise<SyncTransportTestResult> {
  return transportApi().test(config);
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

/**
 * 上传对象：按分片写入（桌面在主进程、浏览器用 WebCrypto），失败按 retry 选项重试；
 * 重试会跳过已完成分片，实现断点续传。
 */
export async function putSyncObject(
  config: SyncTransportConfig,
  key: string,
  data: string,
  options?: RetryOptions,
): Promise<void> {
  await retryAsync(() => transportApi().putChunked(config, key, data), options);
}

/** 下载对象：有分片清单则按分片取回并校验总摘要，无清单回落到整体对象。 */
export async function getSyncObject(
  config: SyncTransportConfig,
  key: string,
  options?: RetryOptions,
): Promise<string | null> {
  return retryAsync(() => transportApi().getChunked(config, key), options);
}

/** 分片/清单对象是传输内部产物，列举时不展示。 */
function isInternalTransferObject(key: string): boolean {
  return key.includes(SYNC_CHUNK_PART_INFIX) || key.endsWith(SYNC_CHUNK_MANIFEST_SUFFIX);
}

/** 列出传输后端上的对象（远端目录查看），内部对象被过滤；失败按 retry 选项重试。 */
export async function listSyncObjects(
  config: SyncTransportConfig,
  prefix?: string,
  options?: RetryOptions,
): Promise<SyncTransportObject[]> {
  const objects = await retryAsync(() => transportApi().list(config, prefix), options);
  return objects.filter((object) => !isInternalTransferObject(object.key));
}

/** 删除传输后端上的对象（远端目录清理），失败按 retry 选项重试。 */
export async function removeSyncObject(
  config: SyncTransportConfig,
  key: string,
  options?: RetryOptions,
): Promise<void> {
  await retryAsync(() => transportApi().remove(config, key), options);
}

/** 给任意 Promise 套超时：超时抛可读错误，原 Promise 继续但结果被忽略。 */
export async function withTimeout<T>(run: Promise<T>, timeoutMs: number, message = '操作超时'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
