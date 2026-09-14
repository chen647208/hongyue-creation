/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { MIN_SEARCH_QUERY_LENGTH } from '../../../../shared/constants/search';
import { APP_STATE_VERSION } from '../../../../shared/constants/versions';
import type { AppState, ConsistencyCheckConfig, ConsistencyCheckPromptTemplate,Project, StorageConfig } from '../../../../shared/types';
import { storage } from '../storage';
import { rankSearchHits } from './searchRank';
import type { CommitOptions,SearchHit, SearchOptions, StorageRepository } from './types';

/** 内存子串检索的片段窗口长度 */
const SNIPPET_WINDOW = 80;

// saveProject/saveSettings 在空存储上首次写入时的最小骨架，随后由调用方补全字段。
const INITIAL_FALLBACK: AppState = {
  schemaVersion: APP_STATE_VERSION,
  projects: [],
  activeProjectId: null,
  models: [],
  prompts: [],
  activeModelId: null,
  embeddingModels: [],
  activeEmbeddingModelId: null,
};

function makeSnippet(content: string, needle: string): string {
  const idx = content.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return content.slice(0, SNIPPET_WINDOW);
  const start = Math.max(0, idx - 20);
  return (start > 0 ? '…' : '') + content.slice(start, start + SNIPPET_WINDOW);
}

/**
 * 写序列化锁：JSON 后端的增量方法是“读-改-写整份”，若并发执行会互相覆盖(丢失更新)。
 * 用 promise 链把所有写操作串行化，保证差分持久化里多个写按提交顺序依次生效。
 */
let writeLock: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn); // 前一个成功或失败都继续，不让链断裂
  writeLock = run.then(
    () => { /* keep chain alive */ },
    () => { /* swallow to avoid unhandled rejection */ }
  );
  return run;
}

/**
 * JSON 文件 / localStorage 后端 —— 对既有 storage.ts 的适配。
 *
 * 它是 repository 接缝的“过渡实现”：整体读写(loadAll/saveAll/clear/导入导出)与
 * 直接调用 storage 行为一致。增量方法(saveProject/deleteProject/saveSettings)在此
 * 退化为“读-改-写整份”，正确但非最优；真正的增量写由 SQLite 后端提供。
 * search 走内存子串过滤（大小写不敏感，支持中文）。
 */
export const jsonRepository: StorageRepository = {
  capabilities: { revisions: false, hotBackup: false, encryption: false, integrity: false },
  loadAll: () => storage.loadStateAsync(),
  loadAllSync: () => storage.loadState(),
  saveAll: (state: AppState) => withWriteLock(() => storage.saveState(state)),
  clear: () => withWriteLock(() => storage.clearState()),

  saveProject: (project: Project, _opts?: CommitOptions) => withWriteLock(async () => {
    // JSON 后端无修订概念：opts 显式丢弃；Revision 审计仅在 SQLite 后端可用
    const state = (await storage.loadStateAsync()) ?? structuredClone(INITIAL_FALLBACK);
    const idx = state.projects.findIndex(p => p.id === project.id);
    if (idx >= 0) state.projects[idx] = project;
    else state.projects.push(project);
    await storage.saveState(state);
  }),

  deleteProject: (id: string) => withWriteLock(async () => {
    const state = await storage.loadStateAsync();
    if (!state) return;
    state.projects = state.projects.filter(p => p.id !== id);
    if (state.activeProjectId === id) state.activeProjectId = state.projects[0]?.id ?? null;
    await storage.saveState(state);
  }),

  saveSettings: (patch: Partial<AppState>) => withWriteLock(async () => {
    const state = (await storage.loadStateAsync()) ?? structuredClone(INITIAL_FALLBACK);
    Object.assign(state, patch);
    await storage.saveState(state);
  }),

  search: async (query: string, options?: SearchOptions): Promise<SearchHit[]> => {
    const q = query.trim();
    if (q.length < MIN_SEARCH_QUERY_LENGTH) return [];
    const state = await storage.loadStateAsync();
    if (!state) return [];
    const limit = options?.limit ?? 50;
    const hits: SearchHit[] = [];
    const lower = q.toLowerCase();
    for (const project of state.projects) {
      if (options?.projectId && project.id !== options.projectId) continue;
      for (const ch of project.chapters) {
        if (ch.content?.toLowerCase().includes(lower) || ch.title?.toLowerCase().includes(lower)) {
          hits.push({ scope: 'chapter', projectId: project.id, id: ch.id, title: ch.title, snippet: makeSnippet(ch.content ?? '', q), rank: hits.length, material: Boolean(ch.material) });
        }
      }
      for (const item of project.knowledge ?? []) {
        if (item.content?.toLowerCase().includes(lower)) {
          hits.push({ scope: 'knowledge', projectId: project.id, id: item.id, category: item.category, snippet: makeSnippet(item.content ?? '', q), rank: hits.length });
        }
      }
      if (hits.length >= limit) break;
    }
    return rankSearchHits(hits, options?.preferMaterial).slice(0, limit);
  },

  exportAll: (state: AppState) => storage.exportData(state),
  importAll: () => storage.importData(),
  exportBook: (project: Project) => storage.exportCurrentBook(project),
  importBook: () => storage.importBook(),

  loadConsistencyCheckConfig: (): Promise<ConsistencyCheckConfig | null> => storage.loadConsistencyCheckConfig(),
  loadConsistencyPrompts: (): Promise<ConsistencyCheckPromptTemplate[] | null> => storage.loadConsistencyPrompts(),

  getStorageConfig: (): Promise<StorageConfig> => storage.getStorageConfig(),
  updateStorageConfig: (config: StorageConfig): Promise<boolean> => storage.updateStorageConfig(config),
};
