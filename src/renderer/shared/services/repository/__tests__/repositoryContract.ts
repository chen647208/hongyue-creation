/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * StorageRepository 共享契约套件：同一组行为在 json / better-sqlite3 / wasm
 * 三个后端上各跑一遍。断言只依赖接口语义，不依赖具体后端实现。
 */
import { describe, expect, it } from 'vitest';

import { APP_STATE_VERSION } from '../../../../../shared/constants/versions';
import type { AppState, Project } from '../../../../../shared/types';
import type { StorageRepository } from '../types';

export interface RepositoryContractOptions {
  name: string;
  /** 返回一个全新的空后端实例（SQLite：新内存库；JSON：单例）。 */
  create: () => Promise<StorageRepository>;
  /** 每个用例开始前清空（JSON 单例需要；SQLite 新库可省略）。 */
  reset?: (repo: StorageRepository) => Promise<void>;
}

const book = (id: string, title: string, content = '他走进了房间'): Project => ({
  id,
  title,
  inspiration: '',
  intro: '',
  outline: '',
  chapters: [{ id: `${id}-c1`, title: '第一章', summary: '', content, order: 0 }],
  virtualChapters: [],
  knowledge: [],
  characters: [],
  lastModified: 0,
} as Project);

const fullState = (projects: Project[], over: Partial<AppState> = {}): AppState => ({
  schemaVersion: APP_STATE_VERSION,
  projects,
  activeProjectId: projects[0]?.id ?? null,
  models: [],
  prompts: [],
  cardPrompts: [],
  consistencyPrompts: [],
  consistencyCheckConfig: { mode: 'rule', selectedPromptTemplates: {} },
  embeddingModels: [],
  activeEmbeddingModelId: null,
  language: 'zh',
  theme: 'light',
  uiFont: '',
  editorFont: '',
  uiFontSize: 14,
  editorFontSize: 18,
  editorLineHeight: 1.9,
  ...over,
} as AppState);

/** 读取某本书正文：惰性后端用 loadBookContent，紧凑后端从 loadAll 取。 */
async function readBook(repo: StorageRepository, id: string): Promise<Project | null> {
  const content = repo.loadBookContent ? await repo.loadBookContent(id) : null;
  if (content) return content;
  const state = await repo.loadAll();
  return state?.projects.find((p) => p.id === id) ?? null;
}

export function runStorageRepositoryContract(options: RepositoryContractOptions): void {
  const fresh = async (): Promise<StorageRepository> => {
    const repo = await options.create();
    if (options.reset) await options.reset(repo);
    return repo;
  };

  describe(`StorageRepository 契约：${options.name}`, () => {
    it('空库 loadAll 返回 null', async () => {
      const repo = await fresh();
      expect(await repo.loadAll()).toBeNull();
    });

    it('saveProject 新增后按 id 读回正文', async () => {
      const repo = await fresh();
      await repo.saveProject(book('p1', '甲书'));
      const loaded = await readBook(repo, 'p1');
      expect(loaded?.title).toBe('甲书');
      expect(loaded?.chapters[0]?.content).toBe('他走进了房间');
    });

    it('saveProject 同 id 为更新而非追加', async () => {
      const repo = await fresh();
      await repo.saveProject(book('p1', '甲书'));
      await repo.saveProject(book('p1', '甲书改'));
      const state = await repo.loadAll();
      expect(state!.projects.filter((p) => p.id === 'p1')).toHaveLength(1);
      expect(state!.projects.find((p) => p.id === 'p1')?.title).toBe('甲书改');
    });

    it('saveProject 不影响其它项目', async () => {
      const repo = await fresh();
      await repo.saveAll(fullState([book('p1', '甲书'), book('p2', '乙书')]));
      await repo.saveProject(book('p1', '甲书改'));
      const state = await repo.loadAll();
      expect(state!.projects.find((p) => p.id === 'p2')?.title).toBe('乙书');
    });

    it('deleteProject 后不再出现', async () => {
      const repo = await fresh();
      await repo.saveAll(fullState([book('p1', '甲书'), book('p2', '乙书')]));
      await repo.deleteProject('p1');
      const state = await repo.loadAll();
      expect(state!.projects.map((p) => p.id)).toEqual(['p2']);
    });

    it('saveAll 全量写入后读回项目与配置切片', async () => {
      const repo = await fresh();
      await repo.saveAll(fullState([book('p1', '甲书'), book('p2', '乙书')], { language: 'en' }));
      const state = await repo.loadAll();
      expect(state!.projects.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
      expect(state!.language).toBe('en');
    });

    it('saveSettings 只写配置切片，不动项目', async () => {
      const repo = await fresh();
      await repo.saveAll(fullState([book('p1', '甲书')]));
      await repo.saveSettings({ language: 'en' });
      const state = await repo.loadAll();
      expect(state!.language).toBe('en');
      expect(state!.projects.map((p) => p.id)).toEqual(['p1']);
    });

    it('search 命中章节正文', async () => {
      const repo = await fresh();
      await repo.saveProject(book('p1', '甲书'));
      const hits = await repo.search('走进了');
      expect(hits.some((h) => h.id === 'p1-c1')).toBe(true);
    });

    it('素材标记随章节持久化往返', async () => {
      const repo = await fresh();
      const b = book('p1', '甲书');
      b.chapters[0]!.material = true;
      await repo.saveProject(b);
      const loaded = await readBook(repo, 'p1');
      expect(loaded?.chapters[0]?.material).toBe(true);
    });

    it('preferMaterial 把素材命中排在非素材之前并带 material 标记', async () => {
      const repo = await fresh();
      const b = book('p1', '甲书');
      b.chapters = [
        { id: 'p1-c1', title: '第一章', summary: '', content: '他走进了房间', order: 0 },
        { id: 'p1-c2', title: '第二章', summary: '', content: '她走进了花园', order: 1, material: true },
      ];
      await repo.saveProject(b);
      const hits = await repo.search('走进了', { preferMaterial: true });
      expect(hits[0]?.id).toBe('p1-c2');
      expect(hits[0]?.material).toBe(true);
    });

    it('clear 后 loadAll 为 null', async () => {
      const repo = await fresh();
      await repo.saveAll(fullState([book('p1', '甲书')]));
      await repo.clear();
      expect(await repo.loadAll()).toBeNull();
    });
  });
}
