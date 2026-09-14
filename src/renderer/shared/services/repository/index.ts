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
import { dialogService } from '../dialogService';
import { localStore } from '../localStore';
import { removeLocalStateFallback } from '../storage';
import { IpcSqlDriver } from './ipcDriver';
import { jsonRepository } from './jsonRepository';
import { migrateLocalToSqlite, type MigrationPlan,planStorageMigration } from './migration';
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
  return { kind: 'local', mismatch: input.sentinel === 'sqlite-opfs' };
}

function readSentinel(): string | null {
  return localStore.getItem(STORAGE_KEYS.storageBackend);
}

function writeSentinel(kind: StorageBackendKind): void {
  const value = kind === 'opfs' ? 'sqlite-opfs' : kind === 'ipc' ? 'sqlite-ipc' : 'json-local';
  localStore.setItem(STORAGE_KEYS.storageBackend, value);
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

/**
 * 启动迁移提议（design/31）：OPFS 可用、localStorage 有数据且 OPFS 为空时，
 * 经用户确认后一次性迁移；失败保留原数据与哨兵。
 */
export async function offerLocalToOpfsMigration(): Promise<boolean> {
  const status = getStorageBackendStatus();
  if (status.kind !== 'opfs') return false;
  const local = await jsonRepository.loadAll().catch(() => null);
  const localHasData = (local?.projects?.length ?? 0) > 0;
  if (!localHasData) return false;
  const current = await repository.loadAll().catch(() => null);
  const plan: MigrationPlan = planStorageMigration({
    hasIpc: false,
    hasOpfs: true,
    sentinel: status.expected,
    localHasData,
    opfsEmpty: (current?.projects?.length ?? 0) === 0,
  });
  if (plan !== 'offer-local-to-opfs') return false;
  const agreed = await dialogService.confirm({
    title: '迁移本地数据到 SQLite 存储',
    message: '检测到本地存储中有书籍数据。是否迁移到 SQLite(OPFS)？迁移前会保留一份 .legacy 副本。',
    confirmText: '迁移',
    cancelText: '暂不',
  });
  if (!agreed) return false;
  const result = await migrateLocalToSqlite({
    loadLocal: () => jsonRepository.loadAll(),
    initTarget: async () => repository,
    keepLegacy: (json) => localStore.setItem(STORAGE_KEYS.storageLegacyBackup, json),
    markMigrated: () => writeSentinel('opfs'),
    clearLocal: () => removeLocalStateFallback(),
  });
  if (!result.ok) {
    logger.error(`[repository] 存储迁移失败：${result.reason ?? 'unknown'}`);
    void dialogService.alert('迁移未完成，原数据已保留。可稍后重试。');
  }
  return result.ok;
}

export type { MigrationPlan } from './migration';
export type { OperationLogEntry, RevisionStat, SqlDriver, SqlRunResult,SqlValue, StorageRepository } from './types';
