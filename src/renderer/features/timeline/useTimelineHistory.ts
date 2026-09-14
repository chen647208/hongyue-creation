/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 时间线撤销栈的 React 绑定：把 TimelineHistory 的 before/after 快照对接到 onUpdate，
 * 并把外部写入（AI 工具 / 同步 / 其他视图）登记为可撤销编辑，保证撤销一致性；
 * 撤销栈按书 id 会话侧车持久化，面板卸载再挂载可续上。
 */
import type { Chapter, Project } from '@shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';

import { i18n } from '@/i18n';

import { loadTimelineHistory, saveTimelineHistory } from './timelineHistoryStorage';
import { type TimelineEditMeta,TimelineHistory } from './timelineOperations';

interface UseTimelineHistoryResult {
  canUndo: boolean;
  canRedo: boolean;
  /** 记录一次编辑并把结果写回项目（同一处提交，保证 before/after 与落库一致）。 */
  commit: (meta: TimelineEditMeta, chapters: Chapter[]) => void;
  undo: () => void;
  redo: () => void;
}

export function useTimelineHistory(
  project: Project,
  onUpdate: (updates: Partial<Project>) => void,
): UseTimelineHistoryResult {
  const historyRef = useRef<TimelineHistory | null>(null);
  // 本次会话自己写回的章节数组引用：与外部写入区分，避免把自身提交再次登记为外部改动
  const lastWrittenRef = useRef<Chapter[]>(project.chapters);
  const projectIdRef = useRef(project.id);
  const [, forceRender] = useState(0);
  const bump = useCallback(() => forceRender((value) => value + 1), []);

  if (!historyRef.current) {
    historyRef.current = loadTimelineHistory(project.id, project.chapters) ?? new TimelineHistory(project.chapters);
  }

  const persist = useCallback((projectId: string) => {
    const history = historyRef.current;
    if (history) saveTimelineHistory(projectId, history);
  }, []);

  // 切换书籍时重建栈：优先续上同书已存栈，否则以当前章节为基线
  useEffect(() => {
    if (projectIdRef.current === project.id) return;
    projectIdRef.current = project.id;
    historyRef.current = loadTimelineHistory(project.id, project.chapters) ?? new TimelineHistory(project.chapters);
    lastWrittenRef.current = project.chapters;
    bump();
  }, [project.id, project.chapters, bump]);

  // 外部写入（AI 工具 / 同步 / 其他视图）：登记为可撤销编辑，撤销回到外部写入之前
  useEffect(() => {
    if (projectIdRef.current !== project.id) return;
    if (project.chapters === lastWrittenRef.current) return;
    const edit = historyRef.current?.recordExternal(project.chapters, i18n.t('timeline:dual.opExternal'));
    lastWrittenRef.current = project.chapters;
    if (edit) {
      persist(project.id);
      bump();
    }
  }, [project.chapters, project.id, persist, bump]);

  const commit = useCallback((meta: TimelineEditMeta, chapters: Chapter[]) => {
    historyRef.current?.record(meta, chapters);
    lastWrittenRef.current = chapters;
    persist(projectIdRef.current);
    onUpdate({ chapters });
    bump();
  }, [onUpdate, persist, bump]);

  const undo = useCallback(() => {
    const chapters = historyRef.current?.undo();
    if (!chapters) return;
    lastWrittenRef.current = chapters;
    persist(projectIdRef.current);
    onUpdate({ chapters });
    bump();
  }, [onUpdate, persist, bump]);

  const redo = useCallback(() => {
    const chapters = historyRef.current?.redo();
    if (!chapters) return;
    lastWrittenRef.current = chapters;
    persist(projectIdRef.current);
    onUpdate({ chapters });
    bump();
  }, [onUpdate, persist, bump]);

  const history = historyRef.current;
  return { canUndo: history?.canUndo ?? false, canRedo: history?.canRedo ?? false, commit, undo, redo };
}
