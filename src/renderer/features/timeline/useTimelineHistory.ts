/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 时间线撤销栈的 React 绑定：把 TimelineHistory 的 before/after 快照对接到 onUpdate。 */
import type { Chapter, Project } from '@shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const historyRef = useRef<TimelineHistory>(new TimelineHistory(project.chapters));
  const projectIdRef = useRef(project.id);
  const [, forceRender] = useState(0);
  const bump = useCallback(() => forceRender((value) => value + 1), []);

  // 切换书籍时重建栈；同书外部改动不回卷历史（避免撤销栈被写盘抖动清空）
  useEffect(() => {
    if (projectIdRef.current === project.id) return;
    projectIdRef.current = project.id;
    historyRef.current.reset(project.chapters);
    bump();
  }, [project.id, project.chapters, bump]);

  const commit = useCallback((meta: TimelineEditMeta, chapters: Chapter[]) => {
    historyRef.current.record(meta, chapters);
    onUpdate({ chapters });
    bump();
  }, [onUpdate, bump]);

  const undo = useCallback(() => {
    const chapters = historyRef.current.undo();
    if (!chapters) return;
    onUpdate({ chapters });
    bump();
  }, [onUpdate, bump]);

  const redo = useCallback(() => {
    const chapters = historyRef.current.redo();
    if (!chapters) return;
    onUpdate({ chapters });
    bump();
  }, [onUpdate, bump]);

  return { canUndo: historyRef.current.canUndo, canRedo: historyRef.current.canRedo, commit, undo, redo };
}
