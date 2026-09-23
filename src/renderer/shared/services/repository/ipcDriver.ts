/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { SqlId } from '../../../../shared/sql/catalog';
import type { ElectronAPI } from '../../../../shared/types';
import type { DbEncryptionStatus,SqlDriver, SqlRunResult,SqlValue } from './types';

type DbBridge = NonNullable<ElectronAPI['db']>;

/**
 * 桌面 SqlDriver —— 把 SQL 操作经 electronAPI.db 转发到主进程的 better-sqlite3。
 *
 * 序列化：单连接、单渲染线程。顶层操作(all/get/run/exec)通过 promise 链互斥串行；
 * transaction 在整个 BEGIN…COMMIT 期间持有该锁，并把一个“直连、不再排队”的子驱动交给回调，
 * 从而既避免自死锁，又保证事务语句之间不会被其它顶层操作插入。
 */
export class IpcSqlDriver implements SqlDriver {
  private readonly api: DbBridge;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(api: DbBridge) {
    this.api = api;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => fn());
    this.tail = result.then(
      () => { /* keep chain alive */ },
      () => { /* swallow to avoid unhandled rejection on the chain */ }
    );
    return result;
  }

  exec(id: SqlId): Promise<void> {
    return this.enqueue(() => this.api.exec(id));
  }

  run(id: SqlId, params: SqlValue[] = []): Promise<SqlRunResult> {
    return this.enqueue(() => this.api.run(id, params));
  }

  all<T = Record<string, SqlValue>>(id: SqlId, params: SqlValue[] = []): Promise<T[]> {
    return this.enqueue(() => this.api.all<T>(id, params));
  }

  get<T = Record<string, SqlValue>>(id: SqlId, params: SqlValue[] = []): Promise<T | undefined> {
    return this.enqueue(() => this.api.get<T>(id, params));
  }

  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      // 事务内写语句先缓冲，读到结果前或提交时一次性批量下发，消除逐条 IPC 往返。
      const buffer: Array<{ id: SqlId; params?: SqlValue[]; exec?: boolean }> = [];
      const drain = async (): Promise<void> => {
        if (buffer.length === 0) return;
        const chunk = buffer.splice(0, buffer.length);
        await this.api.batch(chunk);
      };
      // 事务内的直连子驱动：绕过队列（外层已持锁），避免自死锁。
      const direct: SqlDriver = {
        // exec 里的语句按顺序入缓冲，提交/读取前统一下发。
        exec: async (id) => { buffer.push({ id, exec: true }); },
        // 批量模式不返回真实 changes/rowid；本仓库事务内无调用方读取该结果。
        run: async (id, p = []) => {
          buffer.push({ id, params: p });
          return { changes: 0, lastInsertRowid: 0 };
        },
        all: async <R>(id: SqlId, p: SqlValue[] = []) => {
          await drain();
          return this.api.all<R>(id, p);
        },
        get: async <R>(id: SqlId, p: SqlValue[] = []) => {
          await drain();
          return this.api.get<R>(id, p);
        },
        // SQLite 不支持嵌套 BEGIN：内层事务直接内联执行。
        transaction: (inner) => inner(direct),
        close: () => Promise.resolve(),
      };
      await this.api.exec('engine.begin');
      try {
        const result = await fn(direct);
        await drain();
        await this.api.exec('engine.commit');
        return result;
      } catch (error) {
        buffer.length = 0;
        try {
          await this.api.exec('engine.rollback');
        } catch { /* 回滚失败不覆盖原始错误 */ }
        throw error;
      }
    });
  }

  close(): Promise<void> {
    // 连接由主进程持有并在退出时关闭，这里无需处理。
    return Promise.resolve();
  }

  integrityCheck(): Promise<{ ok: boolean; result: string }> {
    return this.enqueue(() => this.api.integrityCheck());
  }

  fullIntegrityCheck(): Promise<{ ok: boolean; result: string }> {
    return this.enqueue(() => this.api.fullIntegrityCheck());
  }

  hotBackup(keep?: number): Promise<{ ok: boolean; path?: string; bytes?: number; error?: string }> {
    return this.enqueue(() => this.api.hotBackup(keep));
  }

  maintenance(): Promise<void> {
    return this.enqueue(() => this.api.maintenance());
  }

  encryptionStatus(): Promise<DbEncryptionStatus> {
    return this.enqueue(() => this.api.encryptionStatus());
  }

  enableEncryption(): Promise<{ ok: boolean; recoveryCode?: string; error?: string }> {
    return this.enqueue(() => this.api.enableEncryption());
  }

  disableEncryption(): Promise<{ ok: boolean; error?: string }> {
    return this.enqueue(() => this.api.disableEncryption());
  }

  exportRecoveryKey(): Promise<{ ok: boolean; code?: string; error?: string }> {
    return this.enqueue(() => this.api.exportRecoveryKey());
  }

  applyRecoveryKey(code: string): Promise<{ ok: boolean; error?: string }> {
    return this.enqueue(() => this.api.applyRecoveryKey(code));
  }
}
