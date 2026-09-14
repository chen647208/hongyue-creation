/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 存储后端迁移（design/31）：localStorage(JSON) → SQLite(OPFS) 单向一次性迁移。
 * 先写新库并校验，再写哨兵、清旧键；任一步失败即中止且不动原数据。
 */

import type { AppState } from '@shared/types';

import type { StorageRepository } from './types';

export type MigrationPlan = 'none' | 'block-opfs-missing' | 'offer-local-to-opfs';

/** 启动迁移决策（纯函数）：仅有数据时才提议迁移，绝不自动跳库。 */
export function planStorageMigration(input: {
  hasIpc: boolean;
  hasOpfs: boolean;
  sentinel: string | null;
  localHasData: boolean;
  opfsEmpty: boolean;
}): MigrationPlan {
  if (input.hasIpc) return 'none';
  if (input.sentinel === 'sqlite-opfs' && !input.hasOpfs) return 'block-opfs-missing';
  if (input.hasOpfs && input.sentinel !== 'sqlite-opfs' && input.localHasData && input.opfsEmpty) {
    return 'offer-local-to-opfs';
  }
  return 'none';
}

export function countsOf(state: AppState | null): { books: number; chapters: number } {
  const books = state?.projects ?? [];
  return { books: books.length, chapters: books.reduce((n, p) => n + (p.chapters?.length ?? 0), 0) };
}

/** 校验迁移结果：书数与章节数一致。 */
export function sameScale(a: AppState | null, b: AppState | null): boolean {
  const x = countsOf(a);
  const y = countsOf(b);
  return x.books === y.books && x.chapters === y.chapters;
}

export interface MigrationResult {
  ok: boolean;
  reason?: 'empty' | 'write' | 'verify';
  books: number;
  chapters: number;
}

export interface LocalToSqliteDeps {
  loadLocal: () => Promise<AppState | null>;
  initTarget: () => Promise<StorageRepository>;
  keepLegacy: (json: string) => void;
  markMigrated: () => void;
  clearLocal: () => void;
}

export async function migrateLocalToSqlite(deps: LocalToSqliteDeps): Promise<MigrationResult> {
  const state = await deps.loadLocal().catch(() => null);
  const base = countsOf(state);
  if (!state || base.books === 0) return { ok: false, reason: 'empty', ...base };
  const json = JSON.stringify(state);
  let target: StorageRepository;
  try {
    target = await deps.initTarget();
    await target.saveAll(state);
  } catch {
    return { ok: false, reason: 'write', ...base };
  }
  const written = await target.loadAll().catch(() => null);
  if (!sameScale(state, written)) return { ok: false, reason: 'verify', ...base };
  deps.keepLegacy(json);
  deps.markMigrated();
  deps.clearLocal();
  return { ok: true, ...base };
}
