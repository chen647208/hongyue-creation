/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 理线索：把伏笔映射到章节序号的跨度，用于线索图。 */
import type { Foreshadow, Project } from '@shared/types';

export interface ClueArc {
  id: string;
  title: string;
  status: Foreshadow['status'];
  /** 埋设/回收所在章节序号；缺章或未设则为 null。 */
  plantedIndex: number | null;
  payoffIndex: number | null;
  span: number | null;
}

export function buildClues(project: Project): ClueArc[] {
  const ordered = [...(project.chapters ?? [])].sort((a, b) => a.order - b.order);
  const indexOf = new Map(ordered.map((chapter, index) => [chapter.id, index]));
  return (project.foreshadows ?? []).map((foreshadow) => {
    const plantedIndex = foreshadow.plantedChapterId ? indexOf.get(foreshadow.plantedChapterId) ?? null : null;
    const payoffIndex = foreshadow.payoffChapterId ? indexOf.get(foreshadow.payoffChapterId) ?? null : null;
    return {
      id: foreshadow.id,
      title: foreshadow.title,
      status: foreshadow.status,
      plantedIndex,
      payoffIndex,
      span: plantedIndex !== null && payoffIndex !== null ? payoffIndex - plantedIndex : null,
    };
  });
}
