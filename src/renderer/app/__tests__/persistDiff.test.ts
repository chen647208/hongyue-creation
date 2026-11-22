/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it, vi } from 'vitest';

import { APP_STATE_VERSION } from '../../../shared/constants/versions';
import type { AppState, Project } from '../../../shared/types';
import type { StorageRepository } from '../../shared/services/repository';
import { computePersistDiff, persistDiff } from '../persistDiff';

const project = (id: string, over: Partial<Project> = {}): Project =>
  ({ id, title: `书-${id}`, chapters: [], knowledge: [], lastModified: 1000, ...over } as unknown as Project);

// 一个规范基线；测试通过 { ...base, X } 派生“只改 X”的下一帧，
// 未改动的切片保留同一引用 —— 与 App 内不可变更新的真实语义一致。
const base: AppState = {
  schemaVersion: APP_STATE_VERSION,
  projects: [project('a')],
  activeProjectId: 'a',
  providers: [],
  models: [{ id: 'm1' } as never],
  prompts: [],
  activeModelId: 'm1',
  embeddingModels: [],
  activeEmbeddingModelId: null,
};

describe('computePersistDiff', () => {
  it('完全相同（同一对象）→ 无操作', () => {
    expect(computePersistDiff(base, base)).toEqual([]);
  });

  it('新增项目 → saveProject', () => {
    const next = { ...base, projects: [...base.projects, project('new')] };
    const ops = computePersistDiff(base, next);
    expect(ops).toEqual([{ kind: 'saveProject', project: expect.objectContaining({ id: 'new' }) }]);
  });

  it('删除项目 → deleteProject', () => {
    const a = base.projects[0]!;
    const prev = { ...base, projects: [a, project('gone')] };
    const ops = computePersistDiff(prev, base);
    expect(ops).toEqual([{ kind: 'deleteProject', id: 'gone' }]);
  });

  it('改动的书(新引用)写、未改动的书(同引用)跳过', () => {
    const keep = project('keep');
    const editOld = project('edit');
    const editNew = { ...editOld, title: '改名' };
    const prev = { ...base, projects: [keep, editOld] };
    const next = { ...base, projects: [keep, editNew] };
    const ops = computePersistDiff(prev, next);
    expect(ops).toEqual([{ kind: 'saveProject', project: expect.objectContaining({ id: 'edit' }) }]);
  });

  it('配置切片变化 → 单个 saveSettings 仅含变化键', () => {
    const next = { ...base, models: [{ id: 'm2' } as never] };
    const ops = computePersistDiff(base, next);
    expect(ops).toEqual([{ kind: 'saveSettings', patch: { models: [{ id: 'm2' }] } }]);
  });

  it('标量 meta 变化(activeProjectId)并入 saveSettings', () => {
    const b = project('b');
    const next = { ...base, projects: [...base.projects, b], activeProjectId: 'b' };
    const ops = computePersistDiff(base, next);
    const settings = ops.find(o => o.kind === 'saveSettings');
    expect(settings).toEqual({ kind: 'saveSettings', patch: { activeProjectId: 'b' } });
  });

  it('language 变化 → saveSettings 仅含 language', () => {
    const next = { ...base, language: 'en' as const };
    const ops = computePersistDiff(base, next);
    expect(ops).toEqual([{ kind: 'saveSettings', patch: { language: 'en' } }]);
  });

  it('删除+新增+改配置混合', () => {
    const prev = { ...base, projects: [project('keep'), project('del')] };
    const next = { ...base, projects: [prev.projects[0]!, project('add')], activeModelId: 'm9' };
    const kinds = computePersistDiff(prev, next).map(o => o.kind).sort();
    expect(kinds).toEqual(['deleteProject', 'saveProject', 'saveSettings']);
  });
});

describe('persistDiff 执行', () => {
  const mockRepo = () => ({
    saveProject: vi.fn(async () => {}),
    deleteProject: vi.fn(async () => {}),
    saveSettings: vi.fn(async () => {}),
  }) as unknown as StorageRepository & {
    saveProject: ReturnType<typeof vi.fn>;
    deleteProject: ReturnType<typeof vi.fn>;
    saveSettings: ReturnType<typeof vi.fn>;
  };

  it('把差分操作转发到 repository 对应方法', async () => {
    const repo = mockRepo();
    const keep = project('keep');
    const prev = { ...base, projects: [keep, project('del')] };
    const next = { ...base, projects: [keep, project('add')], activeModelId: 'm9' };
    await persistDiff(repo, prev, next);
    expect(repo.deleteProject).toHaveBeenCalledWith('del');
    // 无归因绑定时 opts 透传 undefined（默认 user，由 repository 侧处理）
    expect(repo.saveProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'add' }), undefined);
    expect(repo.saveSettings).toHaveBeenCalledWith({ activeModelId: 'm9' });
    expect(repo.saveProject).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'keep' }));
  });

  it('无变化时不触碰 repository', async () => {
    const repo = mockRepo();
    await persistDiff(repo, base, base);
    expect(repo.saveProject).not.toHaveBeenCalled();
    expect(repo.deleteProject).not.toHaveBeenCalled();
    expect(repo.saveSettings).not.toHaveBeenCalled();
  });
});

describe('归因透传（agentId/cause 进 saveProject）', () => {
  const mockRepo = () => ({
    saveProject: vi.fn(async () => {}),
    deleteProject: vi.fn(async () => {}),
    saveSettings: vi.fn(async () => {}),
  }) as unknown as StorageRepository & {
    saveProject: ReturnType<typeof vi.fn>;
    deleteProject: ReturnType<typeof vi.fn>;
    saveSettings: ReturnType<typeof vi.fn>;
  };

  it('metaOf 命中的项目带 opts，不命中的不带', async () => {
    const repo = mockRepo();
    const edited = { ...project('edit'), title: 'AI 改的' };
    const manual = { ...project('manual'), title: '手改的' };
    const prev = { ...base, projects: [project('edit'), project('manual')] };
    const next = { ...base, projects: [edited, manual] };
    const metaOf = (p: Project) =>
      p.id === 'edit' ? { agentId: 'ai:writing', cause: 'prompt-1' } : undefined;
    await persistDiff(repo, prev, next, metaOf);
    expect(repo.saveProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'edit' }),
      { agentId: 'ai:writing', cause: 'prompt-1' },
    );
    expect(repo.saveProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'manual' }), undefined);
  });

  it('store 绑定：带 opts 的更新挂 WeakMap，不带的无归因', async () => {
    const { useProjectStore, commitMetaOf } = await import('../stores/projectStore');
    useProjectStore.getState().hydrate([project('a')], 'a');
    useProjectStore.getState().updateActiveProject(
      { title: 'AI 章节' },
      { agentId: 'ai:writing', cause: 'p1' },
    );
    const aiRef = useProjectStore.getState().projects[0]!;
    expect(commitMetaOf(aiRef)).toEqual({ agentId: 'ai:writing', cause: 'p1' });

    useProjectStore.getState().updateActiveProject({ title: '手改' });
    const manualRef = useProjectStore.getState().projects[0]!;
    expect(manualRef).not.toBe(aiRef);
    expect(commitMetaOf(manualRef)).toBeUndefined();
  });
});
