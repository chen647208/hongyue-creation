/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 移动端落盘与冲突副本契约（docs/design/35 §7.2）。
 * 冲突分类直接复用 core/sync 的 mergeBundle，不在此重造判定。
 */

import type { NodeEntity } from '@core/entities';
import { canonicalHash, type EntitySnapshot, localState, mergeBundle, type SyncBundle } from '@core/sync';
import { describe, expect, it, vi } from 'vitest';

import { APP_STATE_VERSION } from '../../../shared/constants/versions';
import type { AppState, Chapter, Project } from '../../../shared/types';
import type { StorageRepository } from '../../shared/services/repository';
import { computePersistDiff, persistDiff } from '../persistDiff';

const chapter = (body: string): Chapter => ({
  id: 'ch1',
  title: '第一章',
  content: body,
  order: 0,
  summary: '',
  history: [],
} as unknown as Chapter);

const book = (chapters: Chapter[]): Project => ({
  id: 'book-1',
  title: '测试书',
  chapters,
  knowledge: [],
  characters: [],
  lastModified: 1000,
} as unknown as Project);

// 配置切片复用同一引用：差分只应露出改动的那本书。
const EMPTY: [] = [];
const state = (projects: Project[]): AppState => ({
  schemaVersion: APP_STATE_VERSION,
  projects,
  activeProjectId: 'book-1',
  models: EMPTY,
  prompts: EMPTY,
  activeModelId: null,
  embeddingModels: EMPTY,
  activeEmbeddingModelId: null,
});

/** 内存 repository：写入后保留，模拟重启后读回。 */
function memoryRepo() {
  const saved = new Map<string, Project>();
  return {
    saved,
    saveProject: vi.fn(async (project: Project) => { saved.set(project.id, project); }),
    deleteProject: vi.fn(async (id: string) => { saved.delete(id); }),
    saveSettings: vi.fn(async () => {}),
  } as unknown as StorageRepository & {
    saved: Map<string, Project>;
    saveProject: ReturnType<typeof vi.fn>;
  };
}

describe('移动端改章落盘', () => {
  it('改一章正文 → 差分写出整书，重启读回仍是改后内容', async () => {
    const before = state([book([chapter('旧正文')])]);
    const edited = book([chapter('新正文（移动端改）')]);
    const after = state([edited]);

    // 引用比较：只改动的书产生 saveProject
    expect(computePersistDiff(before, after)).toEqual([
      { kind: 'saveProject', project: expect.objectContaining({ id: 'book-1' }) },
    ]);

    const repo = memoryRepo();
    await persistDiff(repo, before, after);
    expect(repo.saveProject).toHaveBeenCalledTimes(1);

    // 模拟重启：从落盘内容重新读回
    const reloaded = repo.saved.get('book-1');
    expect(reloaded?.chapters[0]?.content).toBe('新正文（移动端改）');
  });

  it('未改动的书不重复写入（差分只碰改动的书）', async () => {
    const untouched = book([]);
    untouched.id = 'book-2';
    const before = state([book([]), untouched]);
    const after = state([book([chapter('改')]), untouched]);
    const ops = computePersistDiff(before, after);
    expect(ops).toHaveLength(1);
    expect((ops[0] as { project: Project }).project.id).toBe('book-1');
  });
});

describe('跨设备冲突复用 mergeBundle', () => {
  const node = (body: string, updatedAt: number): NodeEntity => ({
    id: 'n1',
    type: 'novel.chapter',
    title: '第一章',
    bookId: 'book-1',
    body,
    createdAt: 1000,
    updatedAt,
    erased: false,
  });

  it('本地与远端都改 → 远端以冲突副本新 id 落库，本地原稿不动', () => {
    const localNode = node('本地新正文', 2000);
    const remoteNode = node('远端新正文', 3000);
    const bundle: SyncBundle = {
      version: 1,
      bookId: 'book-1',
      instanceId: 'remote-device',
      generatedAt: 3000,
      changes: [{
        changeId: 1,
        entityName: 'nodes',
        entityId: 'n1',
        hash: canonicalHash(remoteNode),
        isErased: false,
        agentId: 'sync',
        utcDateChanged: 3000,
      }],
      entities: { nodes: [remoteNode], edges: [], attrs: [] },
    };
    const local: EntitySnapshot = { nodes: [localNode], edges: [], attrs: [] };

    const report = mergeBundle(bundle, localState(local));

    expect(report.conflictCopies).toHaveLength(1);
    const copy = report.conflictCopies[0]!;
    expect(copy.sourceId).toBe('n1');
    expect(copy.node.id).not.toBe('n1');
    expect(copy.node.title).toContain('冲突副本');
    expect(copy.node.body).toBe('远端新正文');
    // 插入集只有副本，没有原 id，故本地原稿保持
    expect(report.insertNodes.map((n) => n.id)).toEqual([copy.node.id]);
    expect(localNode.body).toBe('本地新正文');
  });

  it('本地与远端内容一致 → 跳过，不产生副本', () => {
    const same = node('一致正文', 2000);
    const bundle: SyncBundle = {
      version: 1,
      bookId: 'book-1',
      instanceId: 'remote-device',
      generatedAt: 2000,
      changes: [{ changeId: 1, entityName: 'nodes', entityId: 'n1', hash: canonicalHash(same), isErased: false, agentId: 'sync', utcDateChanged: 2000 }],
      entities: { nodes: [same], edges: [], attrs: [] },
    };
    const report = mergeBundle(bundle, localState({ nodes: [same], edges: [], attrs: [] }));
    expect(report.conflictCopies).toHaveLength(0);
    expect(report.skipped).toHaveLength(1);
  });
});
