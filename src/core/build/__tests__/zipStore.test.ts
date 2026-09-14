/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import { describe, expect,it } from 'vitest';

import { crc32Hex, zipStore } from '../zipStore.js';

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe('crc32Hex', () => {
  it('空串与已知向量', () => {
    expect(crc32Hex(new Uint8Array([]))).toBe(0);
    // 标准 CRC-32 校验向量 "123456789" -> 0xCBF43926
    expect(crc32Hex(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('zipStore', () => {
  it('本地头 + 中央目录 + 结束记录结构正确', () => {
    const zip = zipStore({ 'mimetype': 'application/epub+zip', 'a.txt': '你好' });
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // 本地文件头签名
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // 中央目录结束记录签名在尾部 22 字节处
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    // 文件数 2（EOCD 起始 len-22 + 10）
    expect(view.getUint16(zip.length - 12, true)).toBe(2);
  });

  it('STORE 无压缩：原文按字节原样存放', () => {
    const zip = zipStore({ 'a.txt': 'hello' });
    expect(text(zip)).toContain('hello');
  });

  it('中文文件名 UTF-8 往返', () => {
    const zip = zipStore({ '第一章.xhtml': '<p>正文</p>' });
    expect(text(zip)).toContain('第一章.xhtml');
    expect(text(zip)).toContain('<p>正文</p>');
  });

  it('首项顺序保留（ePub mimetype 约束）', () => {
    const zip = zipStore({ 'mimetype': 'x', 'b.txt': 'y' });
    const s = text(zip);
    expect(s.indexOf('mimetype')).toBeLessThan(s.indexOf('b.txt'));
  });
});
