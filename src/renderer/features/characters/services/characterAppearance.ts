/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 角色登场章节：给定角色名，在本书章节正文中按名匹配，产出可跳转的章节列表。
 *
 * 匹配语义与写作面板的按名匹配一致（大小写敏感的连续子串）。
 * 索引器只记录 `@标签` 与 wiki 硬链接引用，不含纯文本提及，无法单独回答登场章节，
 * 因此这里必须扫描章节正文；调用方按「角色名 + chapters」缓存，避免重复扫描。
 */
import type { Chapter } from '../../../../shared/types';

export interface CharacterAppearanceChapter {
  chapterId: string;
  title: string;
  /** 章节顺序（0 基，与 Chapter.order 一致）；列表排序依据。 */
  order: number;
  /** 角色名在正文中出现的次数（非重叠）。 */
  mentions: number;
}

/** 统计 name 在 text 中的非重叠出现次数。 */
function countOccurrences(text: string, name: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at === -1) break;
    count += 1;
    from = at + name.length;
  }
  return count;
}

/**
 * 按角色名匹配章节正文，返回登场章节。
 * 排序：order 升序；order 相同时按传入数组的原始位置稳定排序。
 * 纯函数：同一输入必得同一输出；空名返回空列表。
 */
export function findCharacterAppearances(
  name: string,
  chapters: ReadonlyArray<Pick<Chapter, 'id' | 'title' | 'order' | 'content'>>,
): CharacterAppearanceChapter[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const found: Array<CharacterAppearanceChapter & { index: number }> = [];
  chapters.forEach((chapter, index) => {
    const mentions = countOccurrences(chapter.content ?? '', trimmed);
    if (mentions > 0) {
      found.push({ chapterId: chapter.id, title: chapter.title, order: chapter.order, mentions, index });
    }
  });

  return found
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => ({
      chapterId: entry.chapterId,
      title: entry.title,
      order: entry.order,
      mentions: entry.mentions,
    }));
}
