/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach,beforeEach, describe, expect, it } from 'vitest';

/**
 * 数据安全演练（docs/design/25 §5 L5）：
 * 在真实加密引擎上验证"热备份可恢复、损坏可检出"，用真实引擎而非 mock。
 */
const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function pragmaOk(db: Database.Database, sql: string): boolean {
  const row = db.prepare(`PRAGMA ${sql}`).get() as Record<string, unknown> | undefined;
  const value = row ? String(Object.values(row)[0] ?? '') : '';
  return value.toLowerCase() === 'ok';
}

describe('数据安全演练（真实加密引擎）', () => {
  let dir: string;
  let dbPath: string;
  let backupPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hongyue-safety-'));
    dbPath = path.join(dir, 'enc.db');
    backupPath = path.join(dir, 'backup.db');
    const db = new Database(dbPath);
    db.pragma(`key='${KEY}'`);
    db.exec('CREATE TABLE t(a TEXT)');
    const insert = db.prepare('INSERT INTO t VALUES(?)');
    for (let i = 0; i < 10; i += 1) insert.run(`row-${i}`);
    db.close();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('热备份产出可解密的加密副本且数据一致', () => {
    const db = new Database(dbPath);
    db.pragma(`key='${KEY}'`);
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    db.close();

    expect(fs.readFileSync(backupPath).subarray(0, 15).toString('latin1')).not.toContain('SQLite format 3');

    const restored = new Database(backupPath);
    restored.pragma(`key='${KEY}'`);
    expect(pragmaOk(restored, 'integrity_check')).toBe(true);
    expect((restored.prepare('SELECT COUNT(*) AS c FROM t').get() as { c: number }).c).toBe(10);
    restored.close();
  });

  it('副本被篡改时无法通过完整性检查', () => {
    const db = new Database(dbPath);
    db.pragma(`key='${KEY}'`);
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    db.close();

    const bytes = fs.readFileSync(backupPath);
    const at = Math.floor(bytes.length / 2);
    bytes[at] = (bytes[at] ?? 0) ^ 0xff;
    fs.writeFileSync(backupPath, bytes);

    let readable: boolean;
    try {
      const corrupted = new Database(backupPath);
      corrupted.pragma(`key='${KEY}'`);
      readable = pragmaOk(corrupted, 'integrity_check');
      corrupted.close();
    } catch {
      readable = false;
    }
    expect(readable).toBe(false);
  });
});
