/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { STORAGE_KEYS } from '@shared/constants/storageKeys';

import { logger } from '../../utils/logger';
import { localStore } from '../localStore';
import { IpcSqlDriver } from './ipcDriver';
import { jsonRepository } from './jsonRepository';
import { SqliteRepository } from './sqliteRepository';
import type { StorageRepository } from './types';
import { WasmSqliteDriver } from './wasmDriver';

export type StorageBackendKind = 'ipc' | 'opfs' | 'local';

export interface StorageBackendStatus {
  kind: StorageBackendKind;
  /** 上次成功使用的后端；null = 无记录。 */
  expected: string | null;
  /** 期望 OPFS 但当前不可用：数据可能在另一后端，绝不能静默当空库。 */
  mismatch: boolean;
}

/** 后端决策（纯函数，便于测试）。 */
export function decideStorageBackend(input: { hasIpc: boolean; hasOpfs: boolean; sentinel: string | null }): { kind: StorageBackendKind; mismatch: boolean } {
  if (input.hasIpc) return { kind: 'ipc', mismatch: false };
  if (input.hasOpfs) return { kind: 'opfs', mismatch: false };
  return { kind: 'local', mismatch: input.sentinel === 'opfs' };
}

function readSentinel(): string | null {
  return localStore.getItem(STORAGE_KEYS.storageBackend);
}

function writeSentinel(kind: StorageBackendKind): void {
  localStore.setItem(STORAGE_KEYS.storageBackend, kind === 'opfs' ? 'opfs' : kind);
}

/**
 * 应用数据的唯一入口：统一经 `import { repository }` 访问。
 *
 * 按运行环境探测选择：
 *   - 桌面(Electron，有 electronAPI.db) → SQLite(IpcSqlDriver → 主进程 better-sqlite3)
 *   - 安全上下文的浏览器(有 OPFS)        → SQLite(WasmSqliteDriver → worker + 官方 sqlite-wasm + OPFS)
 *   - 其余(非安全上下文/无 OPFS 的过渡)  → jsonRepository(localStorage)
 */
function opfsAvailable(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.storage?.getDirectory &&
    (typeof window === 'undefined' || window.isSecureContext)
  );
}

function selectRepository(): StorageRepository {
  const db = typeof window !== 'undefined' ? window.electronAPI?.db : undefined;
  if (db) return new SqliteRepository(new IpcSqlDriver(db));
  if (opfsAvailable()) return new SqliteRepository(new WasmSqliteDriver());
  // 非安全上下文/无 OPFS：退回 localStorage，已有 SQLite/OPFS 数据不会自动迁移
  logger.warn('[repository] 无 OPFS，退回 localStorage（不自动迁移既有 SQLite 数据）');
  return jsonRepository;
}

/** 后端选择与哨兵：启动时计算一次；期望 OPFS 但不可用时标记 mismatch 供 UI 提示。 */
const backendDecision = decideStorageBackend({
  hasIpc: typeof window !== 'undefined' ? !!window.electronAPI?.db : false,
  hasOpfs: opfsAvailable(),
  sentinel: readSentinel(),
});

const backendStatus: StorageBackendStatus = {
  kind: backendDecision.kind,
  expected: readSentinel(),
  mismatch: backendDecision.mismatch,
};

if (!backendDecision.mismatch) writeSentinel(backendDecision.kind);

export function getStorageBackendStatus(): StorageBackendStatus {
  return backendStatus;
}

export const repository: StorageRepository = selectRepository();

export type { OperationLogEntry, RevisionStat, SqlDriver, SqlRunResult,SqlValue, StorageRepository } from './types';
