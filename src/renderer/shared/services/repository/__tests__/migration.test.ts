/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { AppState } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';

import {
  countsOf,
  migrateLocalToSqlite,
  planStorageMigration,
  sameScale,
} from '../migration';
import type { StorageRepository } from '../types';

const state = (books: number, chaptersEach: number): AppState =>
  ({
    projects: Array.from({ length: books }, (_, i) => ({
      id: `b${i}`,
      chapters: Array.from({ length: chaptersEach }, (_, j) => ({ id: `c${i}-${j}` })),
    })),
  }) as unknown as AppState;

function fakeTarget(saved: AppState | null, onSave?: () => void): StorageRepository {
  return {
    saveAll: async () => { onSave?.(); },
    loadAll: async () => saved,
  } as unknown as StorageRepository;
}

describe('存储迁移（design/31）', () => {
  it('决策：桌面/OPFS 正常返回 none；哨兵 OPFS 但不可用返回阻断', () => {
    expect(planStorageMigration({ hasIpc: true, hasOpfs: false, sentinel: 'sqlite-opfs', localHasData: true, opfsEmpty: false })).toBe('none');
    expect(planStorageMigration({ hasIpc: false, hasOpfs: false, sentinel: 'sqlite-opfs', localHasData: false, opfsEmpty: false })).toBe('block-opfs-missing');
    expect(planStorageMigration({ hasIpc: false, hasOpfs: true, sentinel: null, localHasData: true, opfsEmpty: true })).toBe('offer-local-to-opfs');
    expect(planStorageMigration({ hasIpc: false, hasOpfs: true, sentinel: 'sqlite-opfs', localHasData: true, opfsEmpty: true })).toBe('none');
    expect(planStorageMigration({ hasIpc: false, hasOpfs: true, sentinel: null, localHasData: false, opfsEmpty: true })).toBe('none');
  });

  it('计数与规模一致判定按书数/章节数', () => {
    expect(countsOf(state(2, 3))).toEqual({ books: 2, chapters: 6 });
    expect(countsOf(null)).toEqual({ books: 0, chapters: 0 });
    expect(sameScale(state(2, 3), state(2, 3))).toBe(true);
    expect(sameScale(state(2, 3), state(2, 2))).toBe(false);
  });

  it('迁移成功：写入→校验→留 legacy→写哨兵→清旧键', async () => {
    const keepLegacy = vi.fn();
    const markMigrated = vi.fn();
    const clearLocal = vi.fn();
    const result = await migrateLocalToSqlite({
      loadLocal: async () => state(2, 3),
      initTarget: async () => fakeTarget(state(2, 3)),
      keepLegacy,
      markMigrated,
      clearLocal,
    });
    expect(result).toEqual({ ok: true, books: 2, chapters: 6 });
    expect(keepLegacy).toHaveBeenCalledOnce();
    expect(markMigrated).toHaveBeenCalledOnce();
    expect(clearLocal).toHaveBeenCalledOnce();
  });

  it('写入失败：中止且不写哨兵、不清旧键', async () => {
    const keepLegacy = vi.fn();
    const markMigrated = vi.fn();
    const clearLocal = vi.fn();
    const result = await migrateLocalToSqlite({
      loadLocal: async () => state(1, 1),
      initTarget: async () => { throw new Error('opfs 不可写'); },
      keepLegacy,
      markMigrated,
      clearLocal,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('write');
    expect(keepLegacy).not.toHaveBeenCalled();
    expect(markMigrated).not.toHaveBeenCalled();
    expect(clearLocal).not.toHaveBeenCalled();
  });

  it('校验失败（规模不一致）：中止且不动原数据', async () => {
    const markMigrated = vi.fn();
    const clearLocal = vi.fn();
    const result = await migrateLocalToSqlite({
      loadLocal: async () => state(2, 3),
      initTarget: async () => fakeTarget(state(1, 1)),
      keepLegacy: vi.fn(),
      markMigrated,
      clearLocal,
    });
    expect(result.reason).toBe('verify');
    expect(markMigrated).not.toHaveBeenCalled();
    expect(clearLocal).not.toHaveBeenCalled();
  });

  it('本地为空：不迁移', async () => {
    const initTarget = vi.fn();
    const result = await migrateLocalToSqlite({
      loadLocal: async () => null,
      initTarget,
      keepLegacy: vi.fn(),
      markMigrated: vi.fn(),
      clearLocal: vi.fn(),
    });
    expect(result.reason).toBe('empty');
    expect(initTarget).not.toHaveBeenCalled();
  });
});
