/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userData: '',
  available: true,
  backend: 'default',
  backendThrows: false,
  decryptThrows: false,
}));

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  safeStorage: {
    isEncryptionAvailable: (): boolean => state.available,
    getSelectedStorageBackend: (): string => {
      if (state.backendThrows) throw new Error('no backend');
      return state.backend;
    },
    encryptString: (plain: string): Buffer => Buffer.from(`enc:${plain}`, 'utf-8'),
    decryptString: (buffer: Buffer): string => {
      if (state.decryptThrows) throw new Error('cannot decrypt');
      const text = buffer.toString('utf-8');
      if (!text.startsWith('enc:')) throw new Error('bad payload');
      return text.slice(4);
    },
  },
}));

vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  encryptionStatus,
  generateDbKey,
  isDbEncryptionEnabled,
  loadDbKey,
  removeDbKeyFile,
  storeDbKey,
} from '../dbKey.js';

const keyFile = (): string => join(state.userData, 'db-encryption.json');

describe('dbKey（数据库加密密钥）', () => {
  beforeEach(() => {
    state.userData = mkdtempSync(join(tmpdir(), 'hy-dbkey-'));
    state.available = true;
    state.backend = 'default';
    state.backendThrows = false;
    state.decryptThrows = false;
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
  });

  it('未启用时状态为关闭、loadDbKey 返回 null', () => {
    expect(isDbEncryptionEnabled()).toBe(false);
    expect(loadDbKey()).toBeNull();
    expect(encryptionStatus()).toEqual({ enabled: false, available: true, weakBackend: false, backend: 'default' });
  });

  it('generateDbKey 生成 64 位十六进制并可用 loadDbKey 还原', () => {
    const key = generateDbKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(isDbEncryptionEnabled()).toBe(true);
    expect(loadDbKey()).toBe(key);

    const file = JSON.parse(readFileSync(keyFile(), 'utf-8')) as { version: number; wrappedKey: string };
    expect(file.version).toBe(1);
    expect(file.wrappedKey).toBe(Buffer.from(`enc:${key}`, 'utf-8').toString('base64'));
  });

  it('storeDbKey 规范化恢复码（大写与空白）后落盘', () => {
    const code = 'ABCDEF0123456789'.repeat(4);
    storeDbKey(`  ${code}  `);
    expect(loadDbKey()).toBe(code.toLowerCase());
  });

  it('storeDbKey 拒绝非法恢复码格式', () => {
    expect(() => storeDbKey('xyz')).toThrow('恢复码格式非法');
    expect(() => storeDbKey('a'.repeat(63))).toThrow('恢复码格式非法');
    expect(isDbEncryptionEnabled()).toBe(false);
  });

  it('钥匙串不可用时生成与恢复均显式失败', () => {
    state.available = false;
    expect(() => generateDbKey()).toThrow('系统钥匙串不可用');
    expect(() => storeDbKey('a'.repeat(64))).toThrow('系统钥匙串不可用');
  });

  it('已加密但钥匙串不可用时 loadDbKey 抛可读错误', () => {
    generateDbKey();
    state.available = false;
    expect(() => loadDbKey()).toThrow('数据库已加密，但系统钥匙串不可用');
  });

  it('解包失败时抛恢复码提示', () => {
    generateDbKey();
    state.decryptThrows = true;
    expect(() => loadDbKey()).toThrow('数据库密钥无法解锁');
  });

  it('密钥文件损坏或版本不支持时抛错', () => {
    writeFileSync(keyFile(), 'not json', 'utf-8');
    expect(() => loadDbKey()).toThrow();

    writeFileSync(keyFile(), JSON.stringify([]), 'utf-8');
    expect(() => loadDbKey()).toThrow('数据库密钥文件格式非法');

    writeFileSync(keyFile(), JSON.stringify({ version: 2, wrappedKey: 'x' }), 'utf-8');
    expect(() => loadDbKey()).toThrow('数据库密钥文件版本不支持');
  });

  it('encryptionStatus 识别 basic_text 弱后端与后端探测失败降级', () => {
    state.backend = 'basic_text';
    expect(encryptionStatus()).toMatchObject({ weakBackend: true, backend: 'basic_text' });

    state.backendThrows = true;
    expect(encryptionStatus()).toMatchObject({ weakBackend: false, backend: 'default' });
  });

  it('removeDbKeyFile 删除文件，缺失时不抛错', () => {
    generateDbKey();
    removeDbKeyFile();
    expect(isDbEncryptionEnabled()).toBe(false);
    expect(() => removeDbKeyFile()).not.toThrow();
  });
});
