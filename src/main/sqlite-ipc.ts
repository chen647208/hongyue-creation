/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * SQLite 数据引擎 IPC —— 在主进程托管 better-sqlite3（N-API 预编译，内嵌 SQLite 3.53.4）。
 *
 * 渲染层（沙箱、contextIsolation）拿不到 Node，只能经语义化通道执行 SQL。
 * 信任模型：语句均来自应用自身编译代码（repository/schema），值一律走 params 绑定，
 * 渲染层不接收任何用户可控的 SQL 文本；与既有文件 IPC 同级信任。
 */
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3-multiple-ciphers';
import { app, ipcMain } from 'electron';

import { SQL, type SqlId } from '../shared/sql/catalog.js';
import { DB_FILE_NAME } from './app/dataDir.js';
import { decryptWithKey,encryptWithKey } from './backupCrypto.js';
import { IPC } from './channels.js';
import {
  encryptionStatus,
  generateDbKey,
  isDbEncryptionEnabled,
  loadDbKey,
  removeDbKeyFile,
  storeDbKey,
} from './dbKey.js';
import { logger } from './logger.js';

/** 主进程热备份目录名与文件名前缀（VACUUM INTO 产物，保留在 userData 下）。 */
export const DB_BACKUP_DIR_NAME = 'backups';
export const DB_BACKUP_PREFIX = 'hongyue-db-';
/** 热备份保留份数（按文件名倒序滚动）。 */
export const DB_BACKUP_KEEP = 5;
/** 数据库被其它连接持锁时的忙等上限（毫秒），避免立刻报 SQLITE_BUSY。 */
export const DB_BUSY_TIMEOUT_MS = 5000;

/** better-sqlite3 绑定值（与 SqlDriver 的 SqlValue 一致）。 */
type BindValue = string | number | bigint | null | Uint8Array;

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), DB_FILE_NAME);
  db = new Database(dbPath);
  // 加密库：先给密钥，之后任何语句才能读取（密钥缺失/错误在此暴露，绝不继续覆盖写）。
  const key = loadDbKey();
  if (key) db.pragma(`key='${escapeSqlLiteral(key)}'`);
  // WAL：并发读写更稳、崩溃可恢复。
  db.pragma('journal_mode = WAL');
  // FULL：每次提交 fsync，断电也不丢已提交事务；本项目写入量小，优先耐久。
  db.pragma('synchronous = FULL');
  // 写前先校验页校验和，尽早暴露损坏页而非继续扩散。
  db.pragma('cell_size_check = ON');
  // 多连接或外部进程持锁时等待而非立即失败。
  db.pragma(`busy_timeout = ${DB_BUSY_TIMEOUT_MS}`);
  // WAL 超过 1000 页自动 checkpoint，避免 WAL 无限增长。
  db.pragma('wal_autocheckpoint = 1000');
  db.pragma('foreign_keys = ON');
  logger.info('db', `SQLite 打开: ${dbPath} (SQLite ${sqliteVersion()})`);
  return db;
}

/** 运行时内嵌的 SQLite 版本号（诊断日志用）。 */
function sqliteVersion(): string {
  const row = getDb().prepare('SELECT sqlite_version() AS version').get() as Record<string, unknown> | undefined;
  return row ? String(Object.values(row)[0] ?? '') : '';
}

/** 热备份文件名（hongyue-db-<ISO 变体>.db），纯函数便于单测。 */
export function dbBackupFileName(now: number): string {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  return `${DB_BACKUP_PREFIX}${stamp}.db`;
}

/** 热备份落点（userData/backups/…），纯函数便于单测。 */
export function resolveDbBackupPath(userDataDir: string, now: number): string {
  return path.join(userDataDir, DB_BACKUP_DIR_NAME, dbBackupFileName(now));
}

/** SQL 字符串字面量转义（VACUUM INTO 的目标路径）。 */
export function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`Invalid ${label}: expected string`);
  }
}

function assertParams(value: unknown): BindValue[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError('Invalid params: expected array');
  }
  for (const p of value) {
    const ok =
      p === null ||
      typeof p === 'string' ||
      typeof p === 'number' ||
      typeof p === 'bigint' ||
      ArrayBuffer.isView(p);
    if (!ok) {
      throw new TypeError('Invalid param: expected null | string | number | bigint | ArrayBufferView');
    }
  }
  return value as BindValue[];
}

export function registerSqliteIpc(): void {
  ipcMain.handle(IPC.db.exec, (_event, id: string) => {
    getDb().exec(resolveSql(id));
  });

  ipcMain.handle(IPC.db.run, (_event, id: string, params: unknown[]) => {
    const r = getDb().prepare(resolveSql(id)).run(...assertParams(params));
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  });

  ipcMain.handle(IPC.db.all, (_event, id: string, params: unknown[]) => {
    return getDb().prepare(resolveSql(id)).all(...assertParams(params));
  });

  ipcMain.handle(IPC.db.get, (_event, id: string, params: unknown[]) => {
    return getDb().prepare(resolveSql(id)).get(...assertParams(params));
  });

  ipcMain.handle(IPC.db.batch, (_event, statements: unknown) => {
    runBatch(statements);
  });

  ipcMain.handle(IPC.db.integrityCheck, () => checkIntegrity());
  ipcMain.handle(IPC.db.fullIntegrityCheck, () => fullIntegrityCheck());
  ipcMain.handle(IPC.db.hotBackup, (_event, keep: unknown) => {
    if (keep !== undefined && (typeof keep !== 'number' || !Number.isFinite(keep))) {
      throw new TypeError('Invalid keep');
    }
    const resolved = typeof keep === 'number' ? Math.min(Math.max(1, Math.floor(keep)), 100) : DB_BACKUP_KEEP;
    return hotBackup(resolved);
  });
  ipcMain.handle(IPC.db.hotBackupList, () => listDbBackups());
  ipcMain.handle(IPC.db.hotBackupVerify, (_event, fileName: unknown) => {
    if (typeof fileName !== 'string') throw new TypeError('Invalid fileName');
    return verifyDbBackup(fileName);
  });
  ipcMain.handle(IPC.db.hotBackupRestore, (_event, fileName: unknown) => {
    if (typeof fileName !== 'string') throw new TypeError('Invalid fileName');
    return restoreDbBackup(fileName);
  });
  ipcMain.handle(IPC.db.maintenance, () => runMaintenance());
  ipcMain.handle(IPC.db.encryptionStatus, () => encryptionStatus());
  ipcMain.handle(IPC.db.enableEncryption, () => enableDbEncryption());
  ipcMain.handle(IPC.db.disableEncryption, () => disableDbEncryption());
  ipcMain.handle(IPC.db.exportRecoveryKey, () => exportDbRecoveryKey());
  ipcMain.handle(IPC.db.applyRecoveryKey, (_event, code: string) => applyDbRecoveryKey(code));
  ipcMain.handle(IPC.db.encryptText, (_event, text: string) => {
    assertString(text, 'text');
    return encryptText(text);
  });
  ipcMain.handle(IPC.db.decryptText, (_event, payload: string) => {
    assertString(payload, 'payload');
    return decryptText(payload);
  });
}

function runPragmaCheck(pragma: string): { ok: boolean; result: string } {
  try {
    const row = getDb().prepare(`PRAGMA ${pragma}`).get() as Record<string, unknown> | undefined;
    const result = row ? String(Object.values(row)[0] ?? '') : '';
    return { ok: result.toLowerCase() === 'ok', result: result || 'unknown' };
  } catch (error) {
    logger.warn('db', `${pragma} 检查失败`, error);
    return { ok: false, result: error instanceof Error ? error.message : String(error) };
  }
}

/** 快速完整性检查（启动用）：只查结构性损坏，代价低。正常为 "ok"。 */
export function checkIntegrity(): { ok: boolean; result: string } {
  return runPragmaCheck('quick_check');
}

/** 深度完整性检查（维护用）：逐页校验，代价高但能发现引用/索引级损坏。 */
export function fullIntegrityCheck(): { ok: boolean; result: string } {
  return runPragmaCheck('integrity_check');
}

/** 维护：VACUUM 压缩 + REINDEX 重建索引。 */
export function runMaintenance(): void {
  const connection = getDb();
  connection.exec('VACUUM');
  connection.exec('REINDEX');
}

/**
 * 热备份：用 `VACUUM INTO` 生成一致的单文件副本（含 WAL 中未 checkpoint 的数据），
 * 落到 userData/backups 并按份数滚动。相比直接复制 .db 文件，不会漏掉 -wal/-shm。
 */
export function hotBackup(keep = DB_BACKUP_KEEP): { ok: boolean; path?: string; bytes?: number; error?: string } {
  try {
    const userDataDir = app.getPath('userData');
    const dir = path.join(userDataDir, DB_BACKUP_DIR_NAME);
    fs.mkdirSync(dir, { recursive: true });
    const dest = resolveDbBackupPath(userDataDir, Date.now());
    getDb().exec(`VACUUM INTO '${escapeSqlLiteral(dest)}'`);
    const bytes = fs.statSync(dest).size;
    cleanupDbBackups(dir, keep);
    logger.info('db', `热备份完成: ${dest} (${bytes} 字节)`);
    return { ok: true, path: dest, bytes };
  } catch (error) {
    logger.warn('db', '热备份失败', error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 备份条目。 */
export interface DbBackupInfo {
  name: string;
  bytes: number;
  mtime: number;
}

/** 校验备份文件名并解析为 backups 目录内的绝对路径（拒绝路径穿越）。 */
function resolveDbBackupFilePath(fileName: string): string | null {
  if (!new RegExp(`^${DB_BACKUP_PREFIX}[A-Za-z0-9._-]+\\.db$`).test(fileName)) return null;
  const dir = path.join(app.getPath('userData'), DB_BACKUP_DIR_NAME);
  const resolved = path.resolve(dir, fileName);
  return resolved.startsWith(path.resolve(dir)) ? resolved : null;
}

/** 列出热备份（按时间倒序）。 */
export function listDbBackups(): DbBackupInfo[] {
  const dir = path.join(app.getPath('userData'), DB_BACKUP_DIR_NAME);
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.startsWith(DB_BACKUP_PREFIX) && name.endsWith('.db'))
      .map((name) => {
        const stat = fs.statSync(path.join(dir, name));
        return { name, bytes: stat.size, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

/** 只读打开备份并 quick_check。 */
export function verifyDbBackup(fileName: string): { ok: boolean; result?: string; error?: string } {
  const filePath = resolveDbBackupFilePath(fileName);
  if (!filePath) return { ok: false, error: 'invalid-name' };
  let probe: Database.Database | null = null;
  try {
    probe = new Database(filePath, { readonly: true });
    const rows = probe.pragma('quick_check') as Array<Record<string, unknown>>;
    const text = rows.map((row) => Object.values(row).join(' ')).join('; ');
    return { ok: text.trim().toLowerCase() === 'ok', result: text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    probe?.close();
  }
}

/** 用备份覆盖当前库：先给当前库热备份兜底，再关闭连接、替换文件；下次访问按需重开。 */
export function restoreDbBackup(fileName: string): { ok: boolean; error?: string } {
  const filePath = resolveDbBackupFilePath(fileName);
  if (!filePath) return { ok: false, error: 'invalid-name' };
  try {
    hotBackup();
    const dbPath = path.join(app.getPath('userData'), DB_FILE_NAME);
    if (db) {
      db.close();
      db = null;
    }
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(`${dbPath}${suffix}`);
      } catch {
        // 文件不存在时忽略
      }
    }
    fs.copyFileSync(filePath, dbPath);
    logger.info('db', `已从备份恢复: ${fileName}`);
    return { ok: true };
  } catch (error) {
    logger.warn('db', '备份恢复失败', error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 备份文件滚动清理：按文件名（时间序）倒序，保留最近 keep 份。 */
function cleanupDbBackups(dir: string, keep: number): void {  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  const backups = names
    .filter((n) => n.startsWith(DB_BACKUP_PREFIX) && n.endsWith('.db'))
    .sort()
    .reverse();
  for (const name of backups.slice(Math.max(1, keep))) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* 清理失败不影响备份结果 */
    }
  }
}

/** 应用退出前 checkpoint + 关闭连接（best-effort）：把 WAL 合并回主文件，缩短恢复窗口。 */
export function closeSqlite(): void {
  if (db) {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (error) {
      logger.warn('db', 'WAL checkpoint 失败', error);
    }
    try {
      db.close();
    } catch (error) {
      logger.warn('db', '关闭 SQLite 连接失败', error);
    }
    db = null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 用数据库主密钥加密文本（备份快照）；未启用加密时报错。 */
function encryptText(plaintext: string): { ok: boolean; data?: string; error?: string } {
  try {
    const key = loadDbKey();
    if (!key) return { ok: false, error: '数据库未启用加密' };
    return { ok: true, data: encryptWithKey(plaintext, key) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/** 用数据库主密钥解密文本（备份快照）。 */
function decryptText(payload: string): { ok: boolean; text?: string; error?: string } {
  try {
    const key = loadDbKey();
    if (!key) return { ok: false, error: '数据库未启用加密' };
    return { ok: true, text: decryptWithKey(payload, key) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/** 解析语句 id 为 SQL 文本；未知 id 一律拒绝（docs/design/27 §2）。 */
function resolveSql(id: unknown): string {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(SQL, id)) {
    throw new Error(`未知 SQL 语句：${String(id)}`);
  }
  return SQL[id as SqlId];
}

/**
 * 批量执行写语句（在一次 IPC 内跑多条，供事务内的连续写合并往返）。
 * 调用方须已开启事务；任一条失败由调用方 ROLLBACK。
 */
function runBatch(statements: unknown): void {
  if (!Array.isArray(statements)) throw new TypeError('Invalid batch: expected array');
  const connection = getDb();
  for (const raw of statements) {
    if (!raw || typeof raw !== 'object') throw new TypeError('Invalid batch statement');
    const { id, params, exec } = raw as { id?: unknown; params?: unknown; exec?: unknown };
    if (exec === true) {
      connection.exec(resolveSql(id));
      continue;
    }
    connection.prepare(resolveSql(id)).run(...assertParams(params));
  }
}

/**
 * 启用库级加密：生成密钥 → 明文库切出 WAL 后 `rekey` → 回到 WAL。
 * rekey 失败时删除刚写入的密钥文件，避免留下"密钥在、库未加密"的错配。
 */
export function enableDbEncryption(): { ok: boolean; recoveryCode?: string; error?: string } {
  if (isDbEncryptionEnabled()) return { ok: false, error: '数据库已启用加密' };
  let key: string;
  try {
    key = generateDbKey();
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  try {
    const connection = getDb();
    connection.pragma('journal_mode = DELETE');
    connection.pragma(`rekey='${escapeSqlLiteral(key)}'`);
    connection.pragma('journal_mode = WAL');
    logger.info('db', '数据库加密已启用');
    return { ok: true, recoveryCode: key };
  } catch (error) {
    removeDbKeyFile();
    logger.warn('db', '启用数据库加密失败', error);
    return { ok: false, error: errorMessage(error) };
  }
}

/** 停用库级加密：密文库切出 WAL 后 `rekey` 为空 → 删除密钥文件。 */
export function disableDbEncryption(): { ok: boolean; error?: string } {
  if (!isDbEncryptionEnabled()) return { ok: true };
  try {
    const connection = getDb();
    connection.pragma('journal_mode = DELETE');
    connection.pragma("rekey=''");
    connection.pragma('journal_mode = WAL');
    removeDbKeyFile();
    logger.info('db', '数据库加密已停用');
    return { ok: true };
  } catch (error) {
    logger.warn('db', '停用数据库加密失败', error);
    return { ok: false, error: errorMessage(error) };
  }
}

/** 导出恢复码（当前主密钥的十六进制串）。 */
export function exportDbRecoveryKey(): { ok: boolean; code?: string; error?: string } {
  try {
    const key = loadDbKey();
    if (!key) return { ok: false, error: '数据库未启用加密' };
    return { ok: true, code: key };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/** 用恢复码试开数据库，验证是否匹配（不改动密钥文件）。 */
function validateRecoveryKey(code: string): boolean {
  const dbPath = path.join(app.getPath('userData'), DB_FILE_NAME);
  let probe: Database.Database | null = null;
  try {
    probe = new Database(dbPath);
    probe.pragma(`key='${escapeSqlLiteral(code)}'`);
    probe.prepare('SELECT count(*) AS n FROM sqlite_master').get();
    return true;
  } catch {
    return false;
  } finally {
    try {
      probe?.close();
    } catch {
      /* 关闭失败不影响判定 */
    }
  }
}

/** 校验恢复码与数据库匹配后重建密钥文件，再重开连接。 */
export function applyDbRecoveryKey(code: string): { ok: boolean; error?: string } {
  try {
    if (!validateRecoveryKey(code)) return { ok: false, error: '恢复码与数据库不匹配' };
    storeDbKey(code);
    closeSqlite();
    getDb();
    return { ok: true };
  } catch (error) {
    logger.warn('db', '应用恢复码失败', error);
    return { ok: false, error: errorMessage(error) };
  }
}
