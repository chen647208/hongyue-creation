/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 泛用分组/卷纯函数：分组由用户命名（卷/幕/单元均可），章节经 groupId 归属。 */
import type { Chapter, ContentGroup } from '@shared/types';

export function addGroup(groups: ContentGroup[], label: string, id: string): ContentGroup[] {
  return [...groups, { id, label, order: groups.length }];
}

export function renameGroup(groups: ContentGroup[], id: string, label: string): ContentGroup[] {
  return groups.map((group) => (group.id === id ? { ...group, label } : group));
}

export function removeGroup(groups: ContentGroup[], id: string): ContentGroup[] {
  return groups.filter((group) => group.id !== id);
}

export function assignChapters(chapters: Chapter[], groupId: string | undefined, chapterIds: string[]): Chapter[] {
  const ids = new Set(chapterIds);
  return chapters.map((chapter) => (ids.has(chapter.id) ? { ...chapter, groupId } : chapter));
}

/** 按分组拆分章节；末尾附「未分组」（含指向已删分组的章节）。 */
export function splitByGroup(groups: ContentGroup[], chapters: Chapter[]): Array<{ group: ContentGroup | null; chapters: Chapter[] }> {
  const sorted = [...groups].sort((a, b) => a.order - b.order);
  const known = new Set(sorted.map((group) => group.id));
  const sections: Array<{ group: ContentGroup | null; chapters: Chapter[] }> = sorted.map((group) => ({ group, chapters: chapters.filter((chapter) => chapter.groupId === group.id) }));
  sections.push({ group: null, chapters: chapters.filter((chapter) => !chapter.groupId || !known.has(chapter.groupId)) });
  return sections;
}
