/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 浏览器端同步传输（design/36）：没有主进程 IPC 时，用 fetch + WebCrypto 直连
 * WebDAV / S3 兼容后端，供 PWA/手机端跨设备收包。桌面仍走主进程 IPC（syncTransportService）。
 *
 * 本地目录后端依赖文件系统，浏览器端不支持（改用 WebDAV/S3）。
 * 请求装配与 SigV4 签名与主进程同构，凭据只在本模块内存短驻，不写日志。
 */
import { SYNC_CHUNK_PART_INFIX, SYNC_CHUNK_SIZE_CHARS } from '@shared/constants/sync';
import {
  chunkKeyDir as cleanChunkKeyDir,
  type ChunkManifest,
  chunkManifestKey as cleanChunkManifestKey,
  chunkPartKey as cleanChunkPartKey,
  parseChunkManifest,
  splitIntoChunks,
  verifyChunkedData,
} from '@shared/sync/chunkManifest';
import type { SyncS3TransportConfig, SyncTransportConfig, SyncTransportObject, SyncWebDavTransportConfig } from '@shared/types';

import { i18n } from '@/i18n';

export interface BrowserTransportSecrets {
  password?: string;
  secretAccessKey?: string;
}

export interface BrowserTransport {
  /** 连通测试：成功 resolve，失败抛出可读原因。 */
  test(): Promise<void>;
  put(key: string, data: string): Promise<void>;
  get(key: string): Promise<string | null>;
  list(prefix?: string): Promise<SyncTransportObject[]>;
  remove(key: string): Promise<void>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 对象键净化：拒绝绝对路径、空段与 `..`，防越出传输根目录。 */
export function sanitizeTransportKey(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = normalized.split('/');
  if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(i18n.t('errors:sync.invalidObjectKey', { key }));
  }
  return normalized;
}

function joinUrl(base: string, ...parts: Array<string | undefined>): string {
  const segments = [base.replace(/\/+$/, '')];
  for (const part of parts) {
    const clean = (part ?? '').replace(/^\/+|\/+$/g, '');
    if (clean) segments.push(clean);
  }
  return segments.join('/');
}

/** UTF-8 → base64（不依赖已废弃的 unescape）。 */
function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// ── WebDAV ──────────────────────────────────────────────────────────────────

export interface WebDavAuth {
  type: 'basic' | 'bearer' | 'none';
  username?: string;
  secret?: string;
}

export function buildWebDavUrl(baseUrl: string, remoteDir: string | undefined, key: string): string {
  return joinUrl(baseUrl, remoteDir, sanitizeTransportKey(key));
}

export function buildWebDavDirUrl(baseUrl: string, remoteDir: string | undefined): string {
  return joinUrl(baseUrl, remoteDir);
}

export function buildWebDavAuthHeader(auth: WebDavAuth): Record<string, string> {
  if (auth.type === 'basic') {
    if (!auth.username) throw new Error(i18n.t('errors:webdav.basicUsernameMissing'));
    return { Authorization: `Basic ${toBase64(`${auth.username}:${auth.secret ?? ''}`)}` };
  }
  if (auth.type === 'bearer') {
    if (!auth.secret) throw new Error(i18n.t('errors:webdav.bearerSecretMissing'));
    return { Authorization: `Bearer ${auth.secret}` };
  }
  return {};
}

const WEBDAV_HREF = /<([a-zA-Z0-9]+:)?href[^>]*>([^<]+)<\/([a-zA-Z0-9]+:)?href>/gi;

/** 取 PROPFIND 响应里的 href 列表（去命名空间前缀）。 */
export function parseWebDavHrefs(xml: string): string[] {
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;
  WEBDAV_HREF.lastIndex = 0;
  while ((match = WEBDAV_HREF.exec(xml)) !== null) {
    const value = match[2]?.trim();
    if (value) hrefs.push(value);
  }
  return hrefs;
}

function createWebDavTransport(
  config: SyncWebDavTransportConfig,
  secrets: BrowserTransportSecrets,
  doFetch: FetchLike,
): BrowserTransport {
  if (!config.baseUrl) throw new Error(i18n.t('errors:webdav.baseUrlMissing'));
  const auth: WebDavAuth = { type: config.authType, username: config.username, secret: secrets.password };
  const authHeaders = (): Record<string, string> => buildWebDavAuthHeader(auth);
  const dirUrl = buildWebDavDirUrl(config.baseUrl, config.remoteDir);

  return {
    async test() {
      const response = await doFetch(dirUrl, { method: 'PROPFIND', headers: { ...authHeaders(), Depth: '0' } });
      if (response.status === 401 || response.status === 403) throw new Error(i18n.t('errors:webdav.authFailed'));
      if (response.status === 404) throw new Error(i18n.t('errors:webdav.dirMissing', { url: dirUrl }));
      if (response.status !== 207 && !response.ok) throw new Error(i18n.t('errors:webdav.unexpectedStatus', { status: response.status, detail: response.statusText }));
    },

    async put(key, data) {
      const response = await doFetch(buildWebDavUrl(config.baseUrl, config.remoteDir, key), {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: data,
      });
      if (!response.ok) throw new Error(i18n.t('errors:webdav.putFailed', { status: response.status, detail: response.statusText }));
    },

    async get(key) {
      const response = await doFetch(buildWebDavUrl(config.baseUrl, config.remoteDir, key), {
        method: 'GET',
        headers: authHeaders(),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(i18n.t('errors:webdav.getFailed', { status: response.status, detail: response.statusText }));
      return response.text();
    },

    async list(prefix) {
      const cleanPrefix = prefix ? sanitizeTransportKey(prefix) : '';
      const listUrl = cleanPrefix ? buildWebDavUrl(config.baseUrl, config.remoteDir, cleanPrefix) : dirUrl;
      const response = await doFetch(listUrl, { method: 'PROPFIND', headers: { ...authHeaders(), Depth: '1' } });
      if (response.status === 404) return [];
      if (response.status !== 207 && !response.ok) throw new Error(i18n.t('errors:webdav.listFailed', { status: response.status, detail: response.statusText }));
      const xml = await response.text();
      const dirPath = new URL(listUrl).pathname.replace(/\/+$/, '');
      const objects: SyncTransportObject[] = [];
      for (const href of parseWebDavHrefs(xml)) {
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(href, config.baseUrl).pathname);
        } catch {
          continue;
        }
        if (!pathname.endsWith('.json')) continue;
        const relative = pathname.startsWith(`${dirPath}/`) ? pathname.slice(dirPath.length + 1) : pathname.replace(/^\/+/, '');
        if (!relative || relative.includes('/')) continue;
        objects.push({ key: cleanPrefix ? `${cleanPrefix}/${relative}` : relative, size: 0 });
      }
      return objects;
    },

    async remove(key) {
      const response = await doFetch(buildWebDavUrl(config.baseUrl, config.remoteDir, key), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok && response.status !== 404) throw new Error(i18n.t('errors:webdav.deleteFailed', { status: response.status, detail: response.statusText }));
    },
  };
}

// ── S3 兼容（AWS SigV4，WebCrypto） ─────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return toHex(new Uint8Array(digest));
}

async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(signature);
}

/** RFC3986 百分号编码；encodeSlash=false 时保留路径分隔符。 */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = '';
  for (const byte of new TextEncoder().encode(value)) {
    const char = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(char)) out += char;
    else if (char === '/' && !encodeSlash) out += char;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/** AWS 时间戳格式：20150830T123600Z。 */
export function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface BrowserS3SignInput {
  method: string;
  host: string;
  canonicalUri: string;
  query?: Record<string, string>;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadHash: string;
  headers?: Record<string, string>;
  now: Date;
}

/** 计算 SigV4 签名并返回完整请求头（含 Authorization）。 */
export async function signAwsV4Browser(input: BrowserS3SignInput): Promise<Record<string, string>> {
  const amzDate = formatAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...(input.headers ?? {}),
    host: input.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': input.payloadHash,
  };

  const sorted = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim()] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalHeaders = sorted.map(([name, value]) => `${name}:${value}\n`).join('');
  const signedHeaders = sorted.map(([name]) => name).join(';');

  const canonicalQuery = Object.entries(input.query ?? {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${uriEncode(name)}=${uriEncode(value)}`)
    .join('&');

  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n');

  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${input.secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, input.region);
  const kService = await hmacSha256(kRegion, 's3');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

interface S3Target {
  protocol: string;
  host: string;
  canonicalUri: string;
  query: Record<string, string>;
}

function createS3Transport(config: SyncS3TransportConfig, secrets: BrowserTransportSecrets, doFetch: FetchLike): BrowserTransport {
  if (!config.endpoint) throw new Error(i18n.t('errors:s3.endpointMissing'));
  if (!config.bucket) throw new Error(i18n.t('errors:s3.bucketMissing'));
  const secretAccessKey = secrets.secretAccessKey;
  if (!secretAccessKey) throw new Error(i18n.t('errors:s3.secretMissing'));
  const endpoint = new URL(config.endpoint);

  const buildTarget = (key?: string, query: Record<string, string> = {}): S3Target => {
    const host = config.pathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
    const bucketPath = config.pathStyle ? `/${uriEncode(config.bucket)}` : '';
    const objectPath = key ? `${bucketPath}/${uriEncode(sanitizeTransportKey(key), false)}` : `${bucketPath}/`;
    return { protocol: endpoint.protocol, host, canonicalUri: objectPath, query };
  };

  const send = async (method: string, target: S3Target, options: { body?: string; headers?: Record<string, string> } = {}): Promise<Response> => {
    const payloadHash = await sha256Hex(options.body ?? '');
    const headers = await signAwsV4Browser({
      method,
      host: target.host,
      canonicalUri: target.canonicalUri,
      query: target.query,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey,
      payloadHash,
      headers: options.headers,
      now: new Date(),
    });
    const queryString = Object.entries(target.query)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, value]) => `${uriEncode(name)}=${uriEncode(value)}`)
      .join('&');
    const url = `${target.protocol}//${target.host}${target.canonicalUri}${queryString ? `?${queryString}` : ''}`;
    return doFetch(url, { method, headers, body: options.body });
  };

  const listQuery = (prefix: string): Record<string, string> => ({
    'list-type': '2',
    'max-keys': '1000',
    ...(prefix ? { prefix } : {}),
  });

  return {
    async test() {
      const response = await send('GET', buildTarget(undefined, listQuery(config.prefix ?? '')));
      if (response.status === 403) throw new Error(i18n.t('errors:s3.authFailed'));
      if (response.status === 404) throw new Error(i18n.t('errors:s3.bucketMismatch'));
      if (!response.ok) throw new Error(i18n.t('errors:s3.unexpectedStatus', { status: response.status, detail: response.statusText }));
    },

    async put(key, data) {
      const response = await send('PUT', buildTarget(key), { body: data, headers: { 'content-type': 'application/json' } });
      if (!response.ok) throw new Error(i18n.t('errors:s3.putFailed', { status: response.status, detail: response.statusText }));
    },

    async get(key) {
      const response = await send('GET', buildTarget(key));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(i18n.t('errors:s3.getFailed', { status: response.status, detail: response.statusText }));
      return response.text();
    },

    async list(prefix) {
      const combined = [config.prefix, prefix].filter((part): part is string => !!part).join('/');
      const response = await send('GET', buildTarget(undefined, listQuery(combined)));
      if (!response.ok) throw new Error(i18n.t('errors:s3.listFailed', { status: response.status, detail: response.statusText }));
      const xml = await response.text();
      const objects: SyncTransportObject[] = [];
      const contents = /<Contents>([\s\S]*?)<\/Contents>/g;
      let match: RegExpExecArray | null;
      while ((match = contents.exec(xml)) !== null) {
        const block = match[1] ?? '';
        const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1];
        if (key === undefined) continue;
        const size = Number(/<Size>([\s\S]*?)<\/Size>/.exec(block)?.[1] ?? '0');
        objects.push({ key, size: Number.isFinite(size) ? size : 0 });
      }
      return objects;
    },

    async remove(key) {
      const response = await send('DELETE', buildTarget(key));
      if (!response.ok && response.status !== 404) throw new Error(i18n.t('errors:s3.deleteFailed', { status: response.status, detail: response.statusText }));
    },
  };
}

// ── 分片与断点续传（与主进程同协议） ────────────────────────────────────────

/** 列出已完成分片键；列举不可用时返回空集（退化为整体重传）。 */
async function listChunkParts(transport: BrowserTransport, cleanKey: string): Promise<Set<string>> {
  const prefix = `${cleanKey}${SYNC_CHUNK_PART_INFIX}`;
  try {
    const objects = await transport.list(cleanChunkKeyDir(cleanKey));
    return new Set(objects.filter((object) => object.key.startsWith(prefix)).map((object) => object.key));
  } catch {
    return new Set();
  }
}

/** 分片上传：先写分片，最后写清单；已有且内容一致的分片跳过，失败重试可续传。 */
export async function putChunkedBrowser(
  transport: BrowserTransport,
  key: string,
  data: string,
  chunkSize = SYNC_CHUNK_SIZE_CHARS,
): Promise<ChunkManifest> {
  const clean = sanitizeTransportKey(key);
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks = splitIntoChunks(data, size);
  const manifest: ChunkManifest = {
    version: 1,
    key: clean,
    chunkSize: size,
    total: chunks.length,
    size: data.length,
    digest: await sha256Hex(data),
  };
  const existing = await listChunkParts(transport, clean);
  for (let index = 0; index < chunks.length; index += 1) {
    const partKey = cleanChunkPartKey(clean, index);
    if (existing.has(partKey)) {
      const remote = await transport.get(partKey);
      if (remote !== null && remote === chunks[index]) continue;
    }
    await transport.put(partKey, chunks[index] ?? '');
  }
  await transport.put(cleanChunkManifestKey(clean), JSON.stringify(manifest));
  return manifest;
}

/** 分片下载：有清单按分片取回并校验总摘要，无清单回落整体对象。 */
export async function getChunkedBrowser(transport: BrowserTransport, key: string): Promise<string | null> {
  const clean = sanitizeTransportKey(key);
  const manifest = parseChunkManifest(await transport.get(cleanChunkManifestKey(clean)));
  if (!manifest) return transport.get(clean);
  const parts: string[] = [];
  for (let index = 0; index < manifest.total; index += 1) {
    const partKey = cleanChunkPartKey(clean, index);
    const part = await transport.get(partKey);
    if (part === null) throw new Error(i18n.t('errors:sync.chunkPartMissing', { partKey }));
    parts.push(part);
  }
  const data = parts.join('');
  if (!verifyChunkedData(manifest, data, await sha256Hex(data))) {
    throw new Error(i18n.t('errors:sync.digestMismatch', { detail: clean }));
  }
  return data;
}

/** 删除分片、清单与整体对象。 */
export async function removeChunkedBrowser(transport: BrowserTransport, key: string): Promise<void> {
  const clean = sanitizeTransportKey(key);
  const manifest = parseChunkManifest(await transport.get(cleanChunkManifestKey(clean)));
  const total = manifest?.total ?? 0;
  for (let index = 0; index < total; index += 1) {
    await transport.remove(cleanChunkPartKey(clean, index));
  }
  await transport.remove(cleanChunkManifestKey(clean));
  await transport.remove(clean);
}

/** 按配置分派浏览器传输实现。 */
export function createBrowserTransport(
  config: SyncTransportConfig,
  secrets: BrowserTransportSecrets = {},
  doFetch: FetchLike = (input, init) => fetch(input, init),
): BrowserTransport {
  switch (config.kind) {
    case 'webdav':
      return createWebDavTransport(config, secrets, doFetch);
    case 's3':
      return createS3Transport(config, secrets, doFetch);
    case 'local':
      throw new Error(i18n.t('errors:sync.localDirUnsupported'));
  }
}
