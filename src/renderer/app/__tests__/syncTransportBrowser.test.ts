/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { SyncS3TransportConfig, SyncWebDavTransportConfig } from '@shared/types';
import { describe, expect,it } from 'vitest';

import {
  buildWebDavAuthHeader,
  buildWebDavDirUrl,
  buildWebDavUrl,
  createBrowserTransport,
  formatAmzDate,
  parseWebDavHrefs,
  sanitizeTransportKey,
  uriEncode,
} from '@/shared/services/syncTransportBrowser';

const webdavConfig: SyncWebDavTransportConfig = {
  kind: 'webdav',
  baseUrl: 'https://host/remote.php/dav/files/user',
  remoteDir: 'hongyue',
  authType: 'basic',
  username: 'alice',
};

describe('sanitizeTransportKey', () => {
  it('去掉首尾斜杠与反斜杠', () => {
    expect(sanitizeTransportKey('\\a/b\\c.json')).toBe('a/b/c.json');
  });

  it('拒绝空键、点段与父目录', () => {
    expect(() => sanitizeTransportKey('')).toThrow();
    expect(() => sanitizeTransportKey('a/../b')).toThrow();
    expect(() => sanitizeTransportKey('/')).toThrow();
  });
});

describe('WebDAV 请求装配', () => {
  it('拼接对象与目录地址', () => {
    expect(buildWebDavUrl('https://host/dav', 'dir', 'a.json')).toBe('https://host/dav/dir/a.json');
    expect(buildWebDavDirUrl('https://host/dav', 'dir')).toBe('https://host/dav/dir');
    expect(buildWebDavUrl('https://host/dav/', undefined, 'a.json')).toBe('https://host/dav/a.json');
  });

  it('Basic/Bearer/无认证头', () => {
    expect(buildWebDavAuthHeader({ type: 'basic', username: 'alice', secret: 'pw' })).toEqual({
      Authorization: `Basic ${Buffer.from('alice:pw', 'utf-8').toString('base64')}`,
    });
    expect(buildWebDavAuthHeader({ type: 'bearer', secret: 't' })).toEqual({ Authorization: 'Bearer t' });
    expect(buildWebDavAuthHeader({ type: 'none' })).toEqual({});
    expect(() => buildWebDavAuthHeader({ type: 'basic' })).toThrow();
    expect(() => buildWebDavAuthHeader({ type: 'bearer' })).toThrow();
  });

  it('解析 PROPFIND href（去命名空间前缀）', () => {
    const xml = '<d:multistatus><d:response><d:href>/dav/a.json</d:href></d:response></d:multistatus>';
    expect(parseWebDavHrefs(xml)).toEqual(['/dav/a.json']);
  });
});

describe('createBrowserTransport', () => {
  it('本地目录在浏览器端不可用', () => {
    expect(() => createBrowserTransport({ kind: 'local', directory: '/tmp' })).toThrow(/浏览器端不支持本地目录/);
  });

  it('WebDAV get 404 返回 null', async () => {
    const transport = createBrowserTransport(webdavConfig, { password: 'pw' }, async () => new Response(null, { status: 404 }));
    expect(await transport.get('a.json')).toBeNull();
  });

  it('WebDAV get 200 返回文本', async () => {
    const transport = createBrowserTransport(webdavConfig, { password: 'pw' }, async () => new Response('{"ok":1}', { status: 200 }));
    expect(await transport.get('a.json')).toBe('{"ok":1}');
  });

  it('WebDAV test 认证失败抛出可读错误', async () => {
    const transport = createBrowserTransport(webdavConfig, {}, async () => new Response(null, { status: 401 }));
    await expect(transport.test()).rejects.toThrow(/认证失败/);
  });

  it('WebDAV list 只收目录下的 json', async () => {
    const xml = [
      '<d:multistatus>',
      '<d:response><d:href>/remote.php/dav/files/user/hongyue/a.json</d:href></d:response>',
      '<d:response><d:href>/remote.php/dav/files/user/hongyue/b.txt</d:href></d:response>',
      '<d:response><d:href>/remote.php/dav/files/user/hongyue/nested/c.json</d:href></d:response>',
      '</d:multistatus>',
    ].join('');
    const transport = createBrowserTransport(webdavConfig, {}, async () => new Response(xml, { status: 207 }));
    expect(await transport.list()).toEqual([{ key: 'a.json', size: 0 }]);
  });
});

describe('S3 签名辅助（纯函数）', () => {
  it('uriEncode 按 RFC3986 编码，路径分隔符可保留', () => {
    expect(uriEncode('a b')).toBe('a%20b');
    expect(uriEncode('a/b', false)).toBe('a/b');
    expect(uriEncode('a/b', true)).toBe('a%2Fb');
  });

  it('formatAmzDate 输出紧凑 UTC', () => {
    expect(formatAmzDate(new Date('2015-08-30T12:36:00.000Z'))).toBe('20150830T123600Z');
  });

  it('S3 缺少密钥时构造即抛出', () => {
    const config: SyncS3TransportConfig = {
      kind: 's3',
      endpoint: 'https://s3.example.com',
      region: 'us-east-1',
      bucket: 'b',
      accessKeyId: 'key',
      pathStyle: true,
    };
    expect(() => createBrowserTransport(config)).toThrow(/Secret Access Key/);
  });
});
