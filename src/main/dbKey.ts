/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 数据库加密密钥：库级加密的密钥生成、包裹与解锁。
 *
 * 主密钥为 32 字节随机数的十六进制串，用 Electron safeStorage（OS 钥匙串：
 * Windows DPAPI / macOS Keychain / Linux Secret Service）包裹后存 userData/db-encryption.json；
 * 配置库时把明文密钥交给 SQLCipher（PRAGMA key）。恢复码即该十六进制串本身，
 * 用于钥匙串丢失/换机时重建密钥文件。
 *
 * 钥匙串不可用时一律显式失败，不静默降级为弱保护（与 secureStore 同一约定）。
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { app, safeStorage } from 'electron';

import { logger } from './logger.js';

const DB_KEY_FILE_NAME = 'db-encryption.json';
/** 主密钥字节数（AES-256）。 */
const KEY_BYTES = 32;
/** 恢复码格式：64 位十六进制。 */
const RECOVERY_CODE_PATTERN = /^[0-9a-f]{64}$/i;

interface DbKeyFile {
  version: 1;
  wrappedKey: string;
  backend: string;
  createdAt: number;
}

interface EncryptionStatus {
  /** 是否已启用（密钥文件存在）。 */
  enabled: boolean;
  /** 系统钥匙串是否可用。 */
  available: boolean;
  /** Linux 无桌面钥匙串时的 basic_text 弱后端。 */
  weakBackend: boolean;
  backend: string;
}

function keyFilePath(): string {
  return path.join(app.getPath('userData'), DB_KEY_FILE_NAME);
}

function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** safeStorage 后端标识（Linux 独有；其他平台调用失败时记 default）。 */
function storageBackend(): string {
  try {
    return safeStorage.getSelectedStorageBackend();
  } catch {
    return 'default';
  }
}

function readKeyFile(): DbKeyFile | null {
  let raw: string;
  try {
    raw = fs.readFileSync(keyFilePath(), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('数据库密钥文件格式非法');
  }
  const file = parsed as Partial<DbKeyFile>;
  if (file.version !== 1 || typeof file.wrappedKey !== 'string') {
    throw new Error('数据库密钥文件版本不支持');
  }
  return {
    version: 1,
    wrappedKey: file.wrappedKey,
    backend: typeof file.backend === 'string' ? file.backend : 'default',
    createdAt: typeof file.createdAt === 'number' ? file.createdAt : 0,
  };
}

function writeKeyFile(file: DbKeyFile): void {
  const target = keyFilePath();
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file), 'utf-8');
  fs.renameSync(tmp, target);
}

export function isDbEncryptionEnabled(): boolean {
  try {
    fs.statSync(keyFilePath());
    return true;
  } catch {
    return false;
  }
}

/** 读取并解包主密钥：未启用返回 null；已启用但钥匙串不可用/解不开则抛错。 */
export function loadDbKey(): string | null {
  const file = readKeyFile();
  if (!file) return null;
  if (!isEncryptionAvailable()) {
    throw new Error('数据库已加密，但系统钥匙串不可用，无法解锁');
  }
  try {
    return safeStorage.decryptString(Buffer.from(file.wrappedKey, 'base64'));
  } catch (err) {
    logger.error('db', '数据库密钥解包失败', err);
    throw new Error('数据库密钥无法解锁（钥匙串已变更），请使用恢复码', { cause: err });
  }
}

/** 生成并包裹存储新主密钥，返回明文密钥（供展示恢复码）。 */
export function generateDbKey(): string {
  if (!isEncryptionAvailable()) {
    throw new Error('系统钥匙串不可用，无法安全保存数据库密钥');
  }
  const key = randomBytes(KEY_BYTES).toString('hex');
  writeKeyFile({
    version: 1,
    wrappedKey: safeStorage.encryptString(key).toString('base64'),
    backend: storageBackend(),
    createdAt: Date.now(),
  });
  return key;
}

/** 用给定恢复码包裹存储主密钥（恢复流程）。 */
export function storeDbKey(code: string): void {
  const normalized = code.trim().toLowerCase();
  if (!RECOVERY_CODE_PATTERN.test(normalized)) {
    throw new Error('恢复码格式非法（应为 64 位十六进制）');
  }
  if (!isEncryptionAvailable()) {
    throw new Error('系统钥匙串不可用，无法安全保存数据库密钥');
  }
  writeKeyFile({
    version: 1,
    wrappedKey: safeStorage.encryptString(normalized).toString('base64'),
    backend: storageBackend(),
    createdAt: Date.now(),
  });
}

export function removeDbKeyFile(): void {
  try {
    fs.unlinkSync(keyFilePath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('db', '删除数据库密钥文件失败', err);
    }
  }
}

export function encryptionStatus(): EncryptionStatus {
  return {
    enabled: isDbEncryptionEnabled(),
    available: isEncryptionAvailable(),
    weakBackend: storageBackend() === 'basic_text',
    backend: storageBackend(),
  };
}
