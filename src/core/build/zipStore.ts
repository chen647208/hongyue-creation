/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * STORE 模式 zip 打包器（docs/design/13）：无压缩，只写结构。
 * ePub/DOCX/ODT 本质是 zip；手写约 80 行，零依赖，可单测。
 * 文件顺序按传入顺序（ePub/ODT 要求 mimetype 首项无压缩，调用方保证）。
 * 打包逻辑归构建层：主进程只做另存对话框与落盘（exportPackage / diagnostics）。
 */

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32Hex(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (CRC_TABLE[(crc ^ (data[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

function dosTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const day = ((date.getFullYear() - 1980) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, date: day };
}

interface ZipEntry {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
  localOffset: number;
}

/** 文件集 → zip 二进制（STORE 无压缩；UTF-8 文件名）。 */
export function zipStore(files: Record<string, string>, now: Date = new Date()): Uint8Array {
  const entries: ZipEntry[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const { time, date } = dosTime(now);

  const push = (bytes: Uint8Array): void => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const u16 = (v: number): void => push(new Uint8Array([v & 0xff, (v >> 8) & 0xff]));
  const u32 = (v: number): void =>
    push(new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]));

  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32Hex(data);
    const localOffset = offset;
    // 本地文件头
    u32(0x04034b50);
    u16(20); // 解压版本
    u16(0x0800); // UTF-8 文件名标志
    u16(0); // STORE
    u16(time);
    u16(date);
    u32(crc);
    u32(data.length);
    u32(data.length);
    u16(nameBytes.length);
    u16(0); // 扩展字段长度
    push(nameBytes);
    push(data);
    entries.push({ name: nameBytes, data, crc, localOffset });
  }

  const centralStart = offset;
  let centralSize = 0;
  const central: Uint8Array[] = [];
  const cpush = (bytes: Uint8Array): void => {
    central.push(bytes);
    centralSize += bytes.length;
  };
  const cu16 = (v: number): void => cpush(new Uint8Array([v & 0xff, (v >> 8) & 0xff]));
  const cu32 = (v: number): void =>
    cpush(new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]));
  for (const e of entries) {
    cu32(0x02014b50);
    cu16(20);
    cu16(20);
    cu16(0x0800);
    cu16(0);
    cu16(time);
    cu16(date);
    cu32(e.crc);
    cu32(e.data.length);
    cu32(e.data.length);
    cu16(e.name.length);
    cu16(0);
    cu16(0);
    cu16(0);
    cu16(0);
    cu32(0);
    cu32(e.localOffset);
    cpush(e.name);
  }
  for (const c of central) push(c);

  // 中央目录结束记录
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(centralSize);
  u32(centralStart);
  u16(0);

  const out = new Uint8Array(offset);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
