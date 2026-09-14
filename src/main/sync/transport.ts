/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 同步传输后端：本地目录 / WebDAV / S3 兼容（docs/design/36）。
 *
 * 三类实现共用同一接口（test/put/get/list/remove）。WebDAV 与 S3 的请求装配
 * （URL、头、AWS SigV4 签名）为纯函数，注入 fetch/fs/now 即可离线单测；
 * 密钥由 IPC 层从保险库解引用后传入，本模块不读保险库、不写日志。
 * SigV4 用 node:crypto 手写，不引入额外依赖。
 */
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  SyncS3TransportConfig,
  SyncTransportConfig,
  SyncWebDavTransportConfig,
} from '../../shared/types.js';

export interface TransportObject {
  key: string;
  size: number;
  modifiedAt?: number;
}

export interface SyncTransport {
  /** 连通测试：成功即 resolve，失败抛出可读原因。 */
  test(): Promise<void>;
  put(key: string, data: string): Promise<void>;
  /** 对象不存在返回 null，其余错误抛出。 */
  get(key: string): Promise<string | null>;
  list(prefix?: string): Promise<TransportObject[]>;
  remove(key: string): Promise<void>;
}

/** 已解引用的凭据；明文只在本进程内存短驻。 */
export interface TransportSecrets {
  password?: string;
  secretAccessKey?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 本地目录后端用到的最小文件系统面；测试注入替身，生产用 node:fs/promises。 */
export interface FileSystemLike {
  stat(target: string): Promise<{ isDirectory(): boolean; size: number; mtimeMs: number }>;
  mkdir(target: string, options: { recursive: true }): Promise<string | undefined>;
  readFile(target: string, encoding: 'utf-8'): Promise<string>;
  writeFile(target: string, data: string, encoding: 'utf-8'): Promise<void>;
  readdir(target: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isFile(): boolean }>>;
  rm(target: string, options: { force: true }): Promise<void>;
}

export interface TransportDeps {
  fetch?: FetchLike;
  fileSystem?: FileSystemLike;
  /** 注入时钟以保证签名可复现。 */
  now?: () => Date;
}

/** 对象键净化：拒绝绝对路径、空段与 `..`，防越出传输根目录。 */
export function sanitizeTransportKey(key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = normalized.split('/');
  if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`非法对象键：${key}`);
  }
  return normalized;
}

// ── 本地目录 ────────────────────────────────────────────────────────────────

export function createLocalTransport(directory: string, deps: TransportDeps = {}): SyncTransport {
  const fileSystem = deps.fileSystem ?? (fs as unknown as FileSystemLike);
  if (!directory) throw new Error('本地传输缺少目标目录');
  const resolveKey = (key: string): string => path.join(directory, ...sanitizeTransportKey(key).split('/'));

  return {
    async test() {
      let stat: { isDirectory(): boolean };
      try {
        stat = await fileSystem.stat(directory);
      } catch {
        throw new Error(`目录不存在或不可访问：${directory}`);
      }
      if (!stat.isDirectory()) throw new Error(`路径不是目录：${directory}`);
      const probe = path.join(directory, '.hongyue-sync-probe');
      try {
        await fileSystem.writeFile(probe, 'ok', 'utf-8');
      } catch {
        throw new Error(`目录不可写：${directory}`);
      }
      await fileSystem.rm(probe, { force: true });
    },

    async put(key, data) {
      const target = resolveKey(key);
      await fileSystem.mkdir(path.dirname(target), { recursive: true });
      await fileSystem.writeFile(target, data, 'utf-8');
    },

    async get(key) {
      try {
        return await fileSystem.readFile(resolveKey(key), 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
        throw error;
      }
    },

    async list(prefix) {
      const cleanPrefix = prefix ? sanitizeTransportKey(prefix) : '';
      const base = cleanPrefix ? path.join(directory, ...cleanPrefix.split('/')) : directory;
      let entries: Array<{ name: string; isFile(): boolean }>;
      try {
        entries = await fileSystem.readdir(base, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
        throw error;
      }
      const objects: TransportObject[] = [];
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const info = await fileSystem.stat(path.join(base, entry.name));
        objects.push({
          key: cleanPrefix ? `${cleanPrefix}/${entry.name}` : entry.name,
          size: info.size,
          modifiedAt: info.mtimeMs,
        });
      }
      return objects;
    },

    async remove(key) {
      await fileSystem.rm(resolveKey(key), { force: true });
    },
  };
}

// ── WebDAV ──────────────────────────────────────────────────────────────────

export interface WebDavAuth {
  type: 'basic' | 'bearer' | 'none';
  username?: string;
  secret?: string;
}

function joinUrl(base: string, ...parts: Array<string | undefined>): string {
  const segments = [base.replace(/\/+$/, '')];
  for (const part of parts) {
    const clean = (part ?? '').replace(/^\/+|\/+$/g, '');
    if (clean) segments.push(clean);
  }
  return segments.join('/');
}

/** 拼 WebDAV 对象地址（基地址 + 远端目录 + 对象键）。 */
export function buildWebDavUrl(baseUrl: string, remoteDir: string | undefined, key: string): string {
  return joinUrl(baseUrl, remoteDir, sanitizeTransportKey(key));
}

/** WebDAV 目录地址（PROPFIND 目标）。 */
export function buildWebDavDirUrl(baseUrl: string, remoteDir: string | undefined): string {
  return joinUrl(baseUrl, remoteDir);
}

export function buildWebDavAuthHeader(auth: WebDavAuth): Record<string, string> {
  if (auth.type === 'basic') {
    if (!auth.username) throw new Error('WebDAV Basic 认证缺少用户名');
    const token = Buffer.from(`${auth.username}:${auth.secret ?? ''}`, 'utf-8').toString('base64');
    return { Authorization: `Basic ${token}` };
  }
  if (auth.type === 'bearer') {
    if (!auth.secret) throw new Error('WebDAV Bearer 认证缺少令牌');
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

export function createWebDavTransport(
  config: SyncWebDavTransportConfig,
  secrets: TransportSecrets = {},
  deps: TransportDeps = {},
): SyncTransport {
  if (!config.baseUrl) throw new Error('WebDAV 缺少服务地址');
  const doFetch = deps.fetch ?? (globalThis.fetch as FetchLike);
  const auth: WebDavAuth = { type: config.authType, username: config.username, secret: secrets.password };
  const authHeaders = (): Record<string, string> => buildWebDavAuthHeader(auth);
  const dirUrl = buildWebDavDirUrl(config.baseUrl, config.remoteDir);

  return {
    async test() {
      const response = await doFetch(dirUrl, { method: 'PROPFIND', headers: { ...authHeaders(), Depth: '0' } });
      if (response.status === 401 || response.status === 403) {
        throw new Error('认证失败：用户名、密码或令牌无效');
      }
      if (response.status === 404) throw new Error(`远端目录不存在：${dirUrl}`);
      if (response.status !== 207 && !response.ok) {
        throw new Error(`WebDAV 返回 ${response.status} ${response.statusText}`);
      }
    },

    async put(key, data) {
      const response = await doFetch(buildWebDavUrl(config.baseUrl, config.remoteDir, key), {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: data,
      });
      if (!response.ok) throw new Error(`WebDAV 上传失败：${response.status} ${response.statusText}`);
    },

    async get(key) {
      const response = await doFetch(buildWebDavUrl(config.baseUrl, config.remoteDir, key), {
        method: 'GET',
        headers: authHeaders(),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`WebDAV 下载失败：${response.status} ${response.statusText}`);
      return response.text();
    },

    async list(prefix) {
      const response = await doFetch(dirUrl, { method: 'PROPFIND', headers: { ...authHeaders(), Depth: '1' } });
      if (response.status === 404) return [];
      if (response.status !== 207 && !response.ok) {
        throw new Error(`WebDAV 列举失败：${response.status} ${response.statusText}`);
      }
      const xml = await response.text();
      const dirPath = new URL(dirUrl).pathname.replace(/\/+$/, '');
      const objects: TransportObject[] = [];
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
        objects.push({ key: prefix ? `${sanitizeTransportKey(prefix)}/${relative}` : relative, size: 0 });
      }
      return objects;
    },

    async remove(key) {
      const response = await doFetch(buildWebDavUrl(config.baseUrl, config.remoteDir, key), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`WebDAV 删除失败：${response.status} ${response.statusText}`);
      }
    },
  };
}

// ── S3 兼容（AWS SigV4） ────────────────────────────────────────────────────

export function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf-8').digest();
}

/** RFC3986 百分号编码；encodeSlash=false 时保留路径分隔符。 */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = '';
  for (const byte of Buffer.from(value, 'utf-8')) {
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

export interface S3SignInput {
  method: string;
  host: string;
  /** 已编码的规范 URI（路径段保留 '/'）。 */
  canonicalUri: string;
  /** 查询参数（原值，签名时排序并编码）。 */
  query?: Record<string, string>;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 请求体 SHA256 十六进制。 */
  payloadHash: string;
  /** 参与签名的附加头（host 由本函数补入）。 */
  headers?: Record<string, string>;
  now: Date;
  /** 是否加入 x-amz-content-sha256 头（S3 需要；IAM 等示例不需要）。 */
  signContentSha?: boolean;
}

/** 计算 SigV4 签名并返回完整请求头（含 Authorization）。纯函数，注入时间即确定。 */
export function signAwsV4(input: S3SignInput): Record<string, string> {
  const amzDate = formatAmzDate(input.now);
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...(input.headers ?? {}),
    host: input.host,
    'x-amz-date': amzDate,
  };
  if (input.signContentSha) headers['x-amz-content-sha256'] = input.payloadHash;

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

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmacSha256(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, input.region);
  const kService = hmacSha256(kRegion, input.service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf-8').digest('hex');

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 解析 ListObjectsV2 响应的 Contents 条目。 */
export function parseS3ListXml(xml: string): TransportObject[] {
  const objects: TransportObject[] = [];
  const contents = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;
  while ((match = contents.exec(xml)) !== null) {
    const block = match[1] ?? '';
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1];
    if (key === undefined) continue;
    const size = Number(/<Size>([\s\S]*?)<\/Size>/.exec(block)?.[1] ?? '0');
    const modified = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(block)?.[1];
    objects.push({
      key: decodeXml(key),
      size: Number.isFinite(size) ? size : 0,
      modifiedAt: modified ? Date.parse(modified) : undefined,
    });
  }
  return objects;
}

interface S3Target {
  protocol: string;
  host: string;
  canonicalUri: string;
  query: Record<string, string>;
}

export function createS3Transport(
  config: SyncS3TransportConfig,
  secrets: TransportSecrets = {},
  deps: TransportDeps = {},
): SyncTransport {
  if (!config.endpoint) throw new Error('S3 缺少端点地址');
  if (!config.bucket) throw new Error('S3 缺少存储桶');
  const secretAccessKey = secrets.secretAccessKey;
  if (!secretAccessKey) throw new Error('S3 Secret Access Key 缺失：请在设置中重新保存凭据');
  const doFetch = deps.fetch ?? (globalThis.fetch as FetchLike);
  const nowFn = deps.now ?? (() => new Date());
  const endpoint = new URL(config.endpoint);
  const service = 's3';

  const buildTarget = (key?: string, query: Record<string, string> = {}): S3Target => {
    const host = config.pathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
    const bucketPath = config.pathStyle ? `/${uriEncode(config.bucket)}` : '';
    const objectPath = key ? `${bucketPath}/${uriEncode(sanitizeTransportKey(key), false)}` : `${bucketPath}/`;
    return { protocol: endpoint.protocol, host, canonicalUri: objectPath, query };
  };

  const send = async (
    method: string,
    target: S3Target,
    options: { body?: string; headers?: Record<string, string> } = {},
  ): Promise<Response> => {
    const payloadHash = sha256Hex(options.body ?? '');
    const headers = signAwsV4({
      method,
      host: target.host,
      canonicalUri: target.canonicalUri,
      query: target.query,
      region: config.region,
      service,
      accessKeyId: config.accessKeyId,
      secretAccessKey,
      payloadHash,
      headers: options.headers,
      now: nowFn(),
      signContentSha: true,
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
      if (response.status === 403) throw new Error('认证失败：Access Key ID 或 Secret Access Key 无效，或无桶权限');
      if (response.status === 404) throw new Error('存储桶不存在或区域不匹配');
      if (!response.ok) throw new Error(`S3 返回 ${response.status} ${response.statusText}`);
    },

    async put(key, data) {
      const response = await send('PUT', buildTarget(key), {
        body: data,
        headers: { 'content-type': 'application/json' },
      });
      if (!response.ok) throw new Error(`S3 上传失败：${response.status} ${response.statusText}`);
    },

    async get(key) {
      const response = await send('GET', buildTarget(key));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`S3 下载失败：${response.status} ${response.statusText}`);
      return response.text();
    },

    async list(prefix) {
      const combined = [config.prefix, prefix].filter((part): part is string => !!part).join('/');
      const response = await send('GET', buildTarget(undefined, listQuery(combined)));
      if (!response.ok) throw new Error(`S3 列举失败：${response.status} ${response.statusText}`);
      return parseS3ListXml(await response.text());
    },

    async remove(key) {
      const response = await send('DELETE', buildTarget(key));
      if (!response.ok && response.status !== 404) {
        throw new Error(`S3 删除失败：${response.status} ${response.statusText}`);
      }
    },
  };
}

/** 按配置分派到具体后端。 */
export function createTransport(
  config: SyncTransportConfig,
  secrets: TransportSecrets = {},
  deps: TransportDeps = {},
): SyncTransport {
  switch (config.kind) {
    case 'local':
      return createLocalTransport(config.directory, deps);
    case 'webdav':
      return createWebDavTransport(config, secrets, deps);
    case 's3':
      return createS3Transport(config, secrets, deps);
  }
  throw new Error('未知的同步传输类型');
}
