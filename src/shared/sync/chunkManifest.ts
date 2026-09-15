/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 分片传输的纯协议：对象键格式、切分与清单解析、合并校验。
 * 主进程（node:crypto）与浏览器（WebCrypto）共用本模块，各自提供摘要算法；
 * 键净化由调用方完成（主进程与浏览器各有 sanitizeTransportKey）。
 */
import { SYNC_CHUNK_MANIFEST_SUFFIX, SYNC_CHUNK_PART_INFIX } from '../constants/sync.js';

/** 分片清单：最后写入的提交点。 */
export interface ChunkManifest {
  version: 1;
  /** 原始对象键。 */
  key: string;
  chunkSize: number;
  /** 分片总数。 */
  total: number;
  /** 原始数据长度（字符）。 */
  size: number;
  /** 原始数据摘要（主进程 SHA256 / 浏览器 SHA-256，均为小写十六进制）。 */
  digest: string;
}

/** 清单对象键；cleanKey 需已净化。 */
export function chunkManifestKey(cleanKey: string): string {
  return `${cleanKey}${SYNC_CHUNK_MANIFEST_SUFFIX}`;
}

/** 分片对象键：`<key>.part-000000.json`；cleanKey 需已净化。 */
export function chunkPartKey(cleanKey: string, index: number): string {
  return `${cleanKey}${SYNC_CHUNK_PART_INFIX}${String(index).padStart(6, '0')}.json`;
}

/** 对象键所属目录前缀（无目录时为 undefined）。 */
export function chunkKeyDir(cleanKey: string): string | undefined {
  const slash = cleanKey.lastIndexOf('/');
  return slash > 0 ? cleanKey.slice(0, slash) : undefined;
}

/** 按分片大小切割字符串；空串也返回一个空分片，保证清单 total >= 1。 */
export function splitIntoChunks(data: string, chunkSize: number): string[] {
  const size = Math.max(1, Math.floor(chunkSize));
  if (data.length === 0) return [''];
  const chunks: string[] = [];
  for (let offset = 0; offset < data.length; offset += size) chunks.push(data.slice(offset, offset + size));
  return chunks;
}

export function parseChunkManifest(raw: string | null): ChunkManifest | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChunkManifest>;
    if (parsed.version !== 1 || typeof parsed.digest !== 'string' || typeof parsed.total !== 'number' || typeof parsed.chunkSize !== 'number') {
      return null;
    }
    return {
      version: 1,
      key: typeof parsed.key === 'string' ? parsed.key : '',
      chunkSize: parsed.chunkSize,
      total: parsed.total,
      size: typeof parsed.size === 'number' ? parsed.size : 0,
      digest: parsed.digest,
    };
  } catch {
    return null;
  }
}

/** 合并后校验：总长度与总摘要都一致才算完整。 */
export function verifyChunkedData(manifest: ChunkManifest, data: string, digest: string): boolean {
  return data.length === manifest.size && digest === manifest.digest;
}
