/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 传输请求装配与本地读写：WebDAV 的 URL/头、S3 的 SigV4 签名与 ListObjectsV2 解析、
 * 本地目录的键净化与增删改查。fetch/fs 均可注入，纯逻辑离线可测。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { SyncS3TransportConfig, SyncWebDavTransportConfig } from '../../../shared/types.js';
import {
  buildWebDavAuthHeader,
  buildWebDavDirUrl,
  buildWebDavUrl,
  createLocalTransport,
  createS3Transport,
  createWebDavTransport,
  type FileSystemLike,
  formatAmzDate,
  parseS3ListXml,
  parseWebDavHrefs,
  sanitizeTransportKey,
  sha256Hex,
  signAwsV4,
  uriEncode,
} from '../transport.js';

describe('sanitizeTransportKey', () => {
  it('接受相对键并拒绝越界键', () => {
    expect(sanitizeTransportKey('hongyue-sync/b1.json')).toBe('hongyue-sync/b1.json');
    expect(sanitizeTransportKey('/a/b.json')).toBe('a/b.json');
    expect(() => sanitizeTransportKey('../secret')).toThrow();
    expect(() => sanitizeTransportKey('a/../b')).toThrow();
    expect(() => sanitizeTransportKey('')).toThrow();
  });
});

describe('WebDAV 请求装配', () => {
  it('拼接地址时折叠多余斜杠', () => {
    expect(buildWebDavUrl('https://host/dav/', '/user/', 'hongyue-sync/b1.json'))
      .toBe('https://host/dav/user/hongyue-sync/b1.json');
    expect(buildWebDavDirUrl('https://host/dav', 'user')).toBe('https://host/dav/user');
  });

  it('Basic 认证编码用户名密码，Bearer 直传令牌', () => {
    expect(buildWebDavAuthHeader({ type: 'basic', username: 'u', secret: 'p' }))
      .toEqual({ Authorization: `Basic ${Buffer.from('u:p').toString('base64')}` });
    expect(buildWebDavAuthHeader({ type: 'bearer', secret: 'tok' })).toEqual({ Authorization: 'Bearer tok' });
    expect(buildWebDavAuthHeader({ type: 'none' })).toEqual({});
    expect(() => buildWebDavAuthHeader({ type: 'basic', secret: 'p' })).toThrow();
  });

  it('解析 PROPFIND 的 href（含命名空间前缀）', () => {
    const xml = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/user/hongyue-sync/b1.json</d:href></d:response></d:multistatus>';
    expect(parseWebDavHrefs(xml)).toEqual(['/dav/user/hongyue-sync/b1.json']);
  });
});

describe('S3 SigV4 签名', () => {
  it('匹配 AWS 官方示例向量', () => {
    const headers = signAwsV4({
      method: 'GET',
      host: 'iam.amazonaws.com',
      canonicalUri: '/',
      query: { Action: 'ListUsers', Version: '2010-05-08' },
      region: 'us-east-1',
      service: 'iam',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      payloadHash: sha256Hex(''),
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      now: new Date('2015-08-30T12:36:00Z'),
    });
    expect(headers['x-amz-date']).toBe('20150830T123600Z');
    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, ' +
      'SignedHeaders=content-type;host;x-amz-date, ' +
      'Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7',
    );
  });

  it('formatAmzDate 与 uriEncode', () => {
    expect(formatAmzDate(new Date('2015-08-30T12:36:00Z'))).toBe('20150830T123600Z');
    expect(uriEncode('a b/c')).toBe('a%20b%2Fc');
    expect(uriEncode('a b/c', false)).toBe('a%20b/c');
  });

  it('解析 ListObjectsV2 Contents', () => {
    const xml = '<ListBucketResult><Contents><Key>hongyue-sync/b1.json</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><Size>42</Size></Contents></ListBucketResult>';
    const objects = parseS3ListXml(xml);
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({ key: 'hongyue-sync/b1.json', size: 42 });
  });
});

function memoryFs(seed: Record<string, string> = {}) {
  const toKey = (target: string): string => target.replace(/\\/g, '/');
  const files = new Map(Object.entries(seed).map(([key, value]) => [toKey(key), value]));
  const directories = new Set<string>(['/root']);
  const fs: FileSystemLike = {
    async stat(target) {
      const key = toKey(target);
      if (directories.has(key)) return { isDirectory: () => true, size: 0, mtimeMs: 1 };
      const content = files.get(key);
      if (content === undefined) {
        const error = new Error(`ENOENT: ${target}`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return { isDirectory: () => false, size: content.length, mtimeMs: 2 };
    },
    async mkdir(target) {
      directories.add(toKey(target));
      return target;
    },
    async readFile(target) {
      const content = files.get(toKey(target));
      if (content === undefined) {
        const error = new Error(`ENOENT: ${target}`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return content;
    },
    async writeFile(target, data) {
      files.set(toKey(target), data);
    },
    async readdir(target) {
      const prefix = `${toKey(target)}/`;
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]!);
      }
      return [...names].map((name) => ({ name, isFile: () => files.has(`${prefix}${name}`) }));
    },
    async rm(target) {
      files.delete(toKey(target));
    },
  };
  return { fs, files, directories };
}

describe('本地目录传输（注入 fs）', () => {
  it('put/get/list/remove 与键净化', async () => {
    const { fs } = memoryFs();
    const transport = createLocalTransport('/root', { fileSystem: fs });

    await transport.put('hongyue-sync/b1.json', '{"a":1}');
    expect(await transport.get('hongyue-sync/b1.json')).toBe('{"a":1}');
    expect(await transport.list('hongyue-sync')).toEqual([{ key: 'hongyue-sync/b1.json', size: 7, modifiedAt: 2 }]);
    await transport.remove('hongyue-sync/b1.json');
    expect(await transport.get('hongyue-sync/b1.json')).toBeNull();
    await expect(transport.put('../escape', 'x')).rejects.toThrow();
  });

  it('目录不存在时 test 报可读错误', async () => {
    const { fs } = memoryFs();
    const transport = createLocalTransport('/missing', { fileSystem: fs });
    await expect(transport.test()).rejects.toThrow('目录不存在或不可访问');
  });

  it('目录存在可写时 test 通过', async () => {
    const { fs } = memoryFs();
    const transport = createLocalTransport('/root', { fileSystem: fs });
    await expect(transport.test()).resolves.toBeUndefined();
  });

  it('真实文件系统往返', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sync-transport-'));
    const transport = createLocalTransport(dir);
    await transport.test();
    await transport.put('a/b.json', 'hello');
    expect(await transport.get('a/b.json')).toBe('hello');
    expect(await transport.list('a')).toEqual([expect.objectContaining({ key: 'a/b.json', size: 5 })]);
  });
});

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

describe('WebDAV 传输（注入 fetch）', () => {
  const config: SyncWebDavTransportConfig = {
    kind: 'webdav',
    baseUrl: 'https://host/dav',
    remoteDir: 'user',
    authType: 'basic',
    username: 'u',
  };

  it('PUT 携带 Basic 头与 JSON 体', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => jsonResponse('', 201));
    const transport = createWebDavTransport(config, { password: 'p' }, { fetch: fetchMock });

    await transport.put('hongyue-sync/b1.json', '{"a":1}');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://host/dav/user/hongyue-sync/b1.json');
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
  });

  it('GET 404 返回 null', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => jsonResponse('', 404));
    const transport = createWebDavTransport(config, { password: 'p' }, { fetch: fetchMock });
    expect(await transport.get('missing.json')).toBeNull();
  });

  it('test 在 401 时给出认证失败原因', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => jsonResponse('', 401));
    const transport = createWebDavTransport(config, { password: 'bad' }, { fetch: fetchMock });
    await expect(transport.test()).rejects.toThrow('认证失败');
  });
});

describe('S3 传输（注入 fetch）', () => {
  const config: SyncS3TransportConfig = {
    kind: 's3',
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    region: 'us-east-1',
    bucket: 'novels',
    prefix: 'hongyue-sync',
    accessKeyId: 'AKIDEXAMPLE',
    pathStyle: false,
  };

  it('PUT 使用虚拟主机寻址并带上 SigV4 头', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => jsonResponse('', 200));
    const transport = createS3Transport(config, { secretAccessKey: 'secret' }, {
      fetch: fetchMock,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    await transport.put('hongyue-sync/b1.json', '{"a":1}');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://novels.s3.us-east-1.amazonaws.com/hongyue-sync/b1.json');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toContain('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20260101/us-east-1/s3/aws4_request');
    expect(headers['x-amz-content-sha256']).toBe(sha256Hex('{"a":1}'));
  });

  it('路径寻址用于 MinIO 类端点', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => jsonResponse('<ListBucketResult></ListBucketResult>', 200));
    const transport = createS3Transport(
      { ...config, endpoint: 'http://127.0.0.1:9000', pathStyle: true },
      { secretAccessKey: 'secret' },
      { fetch: fetchMock, now: () => new Date('2026-01-01T00:00:00Z') },
    );

    await transport.list();

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('http://127.0.0.1:9000/novels/?list-type=2');
  });

  it('list 解析 XML 为对象条目', async () => {
    const xml = '<ListBucketResult><Contents><Key>hongyue-sync/b1.json</Key><Size>7</Size></Contents></ListBucketResult>';
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => jsonResponse(xml));
    const transport = createS3Transport(config, { secretAccessKey: 'secret' }, {
      fetch: fetchMock,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });
    expect(await transport.list()).toEqual([{ key: 'hongyue-sync/b1.json', size: 7, modifiedAt: undefined }]);
  });
});
