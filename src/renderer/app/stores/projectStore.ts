/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 项目 store（06 篇 §2.2 双 store 划分：写作热路径）。
 *
 * 章节正文/大纲/角色/知识库等高频编辑数据；按书不可变更新，写路径收敛为
 * updateActiveProject / upsertProject / removeProject 三个动作，persistDiff
 * 以引用比较判定 saveProject/deleteProject 增量。
 */

import { create } from 'zustand';

import { type Project } from '../../../shared/types';
import { i18n } from '../../i18n';
import { emitPluginEvent } from '../../shared/services/pluginEventBus';
import { repository } from '../../shared/services/repository';
import type { CommitOptions } from '../../shared/services/repository/types';

/**
 * 变更归因绑定：新 Project 对象引用 → 本次提交的 CommitOptions。
 * WeakMap 随对象 GC，无残留；无绑定即默认 'user'。persistDiff 经 commitMetaOf 取用。
 */
const commitMeta = new WeakMap<object, CommitOptions>();

export function commitMetaOf(project: Project): CommitOptions | undefined {
  return commitMeta.get(project);
}

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  /** 从 repository 载入的初始状态整体灌入（首启动/全量导入/删除后重定向）。 */
  hydrate: (projects: Project[], activeProjectId: string | null) => void;
  setActiveProject: (bookId: string | null) => void;
  /** 惰性载入：补载指定书（缺省全部未载入书）的正文，导出/备份前调用。 */
  hydrateAll: (bookIds?: string[]) => Promise<void>;
  /**
   * 更新活动书（无活动书时按旧语义创建默认书）；正文/大纲等编辑统一入口。
   * opts 标注变更来源（AI 落笔传 { agentId: 'ai:<来源>', cause }），绑定到新对象引用，
   * 由持久化桥带入 saveProject；不传即 'user'。
   */
  updateActiveProject: (updates: Partial<Project>, opts?: CommitOptions) => void;
  /** 整书插入或替换（新建/复制/导入）。 */
  upsertProject: (book: Project) => void;
  /** 删除书；若删除的是活动书则活动指针落到剩余首本或 null。 */
  removeProject: (bookId: string) => void;
  /** 按 id 更新任意书（重命名/打标共用；不存在 id 静默跳过）。 */
  updateProject: (bookId: string, updates: Partial<Project>) => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  activeProjectId: null,
  hydrate: (projects, activeProjectId) => set({ projects, activeProjectId }),
  setActiveProject: (bookId) => {
    const previousId = get().activeProjectId;
    set({ activeProjectId: bookId });
    // 惰性载入：打开未 hydrate 的书时补载正文（等值写回，不会产生变更/修订）。
    if (!bookId) return;
    const book = get().projects.find((project) => project.id === bookId);
    if (book && bookId !== previousId) {
      emitPluginEvent('project.open', { bookId, title: book.title });
    }
    if (!book || book.hydrated !== false) return;
    void repository
      .loadBookContent?.(bookId)
      .then((full) => {
        if (!full) return;
        set((state) => ({ projects: state.projects.map((project) => (project.id === bookId ? full : project)) }));
      })
      .catch(() => undefined);
  },

  updateActiveProject: (updates, opts) => {
    const { activeProjectId, projects } = get();
    if (!activeProjectId) {
      const newProject: Project = {
        id: Date.now().toString(),
        title: i18n.t('app:book.defaultTitle'),
        inspiration: '',
        intro: '',
        characters: [],
        outline: '',
        chapters: [],
        virtualChapters: [],
        knowledge: [],
        lastModified: Date.now(),
        ...updates,
      };
      if (opts) commitMeta.set(newProject, opts);
      set({ projects: [...projects, newProject], activeProjectId: newProject.id });
      return;
    }
    set({
      projects: projects.map((p) => {
        if (p.id !== activeProjectId) return p;
        const next = { ...p, ...updates, lastModified: Date.now() };
        if (opts) commitMeta.set(next, opts);
        return next;
      }),
    });
  },

  upsertProject: (book) =>
    set((state) => {
      const exists = state.projects.some((p) => p.id === book.id);
      return {
        projects: exists
          ? state.projects.map((p) => (p.id === book.id ? book : p))
          : [...state.projects, book],
        activeProjectId: book.id,
      };
    }),

  removeProject: (bookId) =>
    set((state) => {
      const wasActive = state.activeProjectId === bookId;
      const remaining = state.projects.filter((p) => p.id !== bookId);
      return {
        projects: remaining,
        activeProjectId: wasActive ? (remaining[0]?.id ?? null) : state.activeProjectId,
      };
    }),

  updateProject: (bookId, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === bookId ? { ...p, ...updates, lastModified: Date.now() } : p,
      ),
    })),

  hydrateAll: async (bookIds) => {
    if (!repository.loadBookContent) return;
    const targets = get().projects.filter(
      (project) => project.hydrated === false && (!bookIds || bookIds.includes(project.id)),
    );
    for (const book of targets) {
      const full = await repository.loadBookContent(book.id).catch(() => null);
      if (full) set((state) => ({ projects: state.projects.map((p) => (p.id === book.id ? full : p)) }));
    }
  },
}));

/** 便捷选择器：当前活动书（无则 null）。 */
export const selectActiveProject = (s: ProjectState): Project | null =>
  s.projects.find((p) => p.id === s.activeProjectId) ?? null;

/** 调用方统一从 store 取归因类型，避免各写一遍深路径。 */
export type { CommitOptions } from '../../shared/services/repository/types';
