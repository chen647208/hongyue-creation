/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 真实 SQLite 驱动夹具：better-sqlite3（桌面）与 sqlite-wasm（网页 OPFS）共用同一契约。 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import Database from 'better-sqlite3-multiple-ciphers';

import { SQL,type SqlId } from '../../../../../shared/sql/catalog';
import type { SqlDriver, SqlRunResult, SqlValue } from '../types';
import { runWasmRequest } from '../wasmSql';

export interface DriverFixture {
  name: string;
  create(): Promise<{
    driver: SqlDriver;
    rawGet<T>(sql: string, params?: SqlValue[]): T | undefined;
    rawAll<T>(sql: string, params?: SqlValue[]): T[];
    dispose(): void;
  }>;
}

export const nodeSqliteFixture: DriverFixture = {
  name: 'better-sqlite3',
  async create() {
    const db = new Database(':memory:');
    const driver: SqlDriver = {
      exec: async (id) => { db.exec(SQL[id]); },
      run: async (id, params = []) => {
        const r = db.prepare(SQL[id]).run(...(params as unknown as never[]));
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
      },
      all: async <T>(id: SqlId, params: SqlValue[] = []) => db.prepare(SQL[id]).all(...(params as never[])) as T[],
      get: async <T>(id: SqlId, params: SqlValue[] = []) => db.prepare(SQL[id]).get(...(params as never[])) as T | undefined,
      transaction: async (fn) => {
        db.exec('BEGIN');
        try {
          const result = await fn(driver);
          db.exec('COMMIT');
          return result;
        } catch (e) {
          try { db.exec('ROLLBACK'); } catch { /* noop */ }
          throw e;
        }
      },
      close: async () => { db.close(); },
    };
    return {
      driver,
      rawGet: <T>(sql: string, params: SqlValue[] = []) => db.prepare(sql).get(...(params as never[])) as T,
      rawAll: <T>(sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...(params as never[])) as T[],
      dispose: () => { try { db.close(); } catch { /* noop */ } },
    };
  },
};

export const wasmFixture: DriverFixture = {
  name: '@sqlite.org/sqlite-wasm',
  async create() {
    const initModule = sqlite3InitModule as unknown as (
      config?: Record<string, unknown>
    ) => ReturnType<typeof sqlite3InitModule>;
    const sqlite3 = await initModule({ print: () => {}, printErr: () => {} });
    const db = new sqlite3.oo1.DB(':memory:');
    const capi = sqlite3.capi;
    const req = (method: 'exec' | 'run' | 'all' | 'get', sql: string, params: SqlValue[] = []) =>
      runWasmRequest(db, capi, { method, sql, params });
    const driver: SqlDriver = {
      exec: async (id) => { req('exec', SQL[id]); },
      run: async (id, params = []) => req('run', SQL[id], params) as SqlRunResult,
      all: async <T>(id: SqlId, params: SqlValue[] = []) => req('all', SQL[id], params) as T[],
      get: async <T>(id: SqlId, params: SqlValue[] = []) => req('get', SQL[id], params) as T | undefined,
      transaction: async (fn) => {
        req('exec', SQL['engine.begin']);
        try {
          const result = await fn(driver);
          req('exec', SQL['engine.commit']);
          return result;
        } catch (e) {
          try { req('exec', SQL['engine.rollback']); } catch { /* noop */ }
          throw e;
        }
      },
      close: async () => { db.close(); },
    };
    return {
      driver,
      rawGet: <T>(sql: string, params: SqlValue[] = []) => req('get', sql, params) as T,
      rawAll: <T>(sql: string, params: SqlValue[] = []) => req('all', sql, params) as T[],
      dispose: () => { try { db.close(); } catch { /* noop */ } },
    };
  },
};

export const sqliteFixtures: readonly DriverFixture[] = [nodeSqliteFixture, wasmFixture];
