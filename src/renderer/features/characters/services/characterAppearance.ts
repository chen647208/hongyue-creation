/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 角色登场章节：在一本书的章节正文里按角色名与别名匹配，产出可跳转的章节列表。
 *
 * 匹配语义：大小写敏感的连续子串（与写作面板的按名匹配一致）；多个名字各计出现数后求和。
 * 别名来源：legacy 角色对象没有别名字段，改用索引快照（indexService.snapshot）：
 *   - `tags`：DSL 标签声明 `@tag: 主名 | 别名` 的别名，以及角色作为别名被声明时的主名；
 *   - `refs`：引用该角色的 `@目标` / `[[目标]]` 原文，落到别名字面量。
 * 索引器只记录引用，不含纯文本提及，无法单独回答登场章节，因此这里仍扫描章节正文。
 * 索引缺失（未建快照）时仅按角色名匹配，不报错。
 */
import type { Chapter } from '../../../../shared/types';

export interface CharacterAppearanceChapter {
  chapterId: string;
  title: string;
  /** 章节顺序（0 基，与 Chapter.order 一致）；列表排序依据。 */
  order: number;
  /** 角色名与别名在正文中出现的次数之和（非重叠）。 */
  mentions: number;
}

/** 别名来源：只需索引快照的标签与引用两张表（结构化子集，便于单测）。 */
export interface CharacterAliasSource {
  tags: ReadonlyMap<string, { displayName: string; aliases: readonly string[] }>;
  refs: ReadonlyMap<string, ReadonlyArray<{ target: string }>>;
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

/** 角色名 + 别名去空白去重，空名剔除；主名排在前，便于稳定输出。 */
export function normalizeAppearanceNames(name: string, aliases: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of [name, ...aliases]) {
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * 从索引快照推导角色别名：命中主名取其余别名，命中别名取主名与其别名，再并入引用原文。
 * 返回不含主名本身、去重的别名列表。
 */
export function characterAliasesFromIndex(name: string, source: CharacterAliasSource): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const aliases = new Set<string>();

  const add = (candidate: string) => {
    const value = candidate.trim();
    if (value && value !== trimmed) aliases.add(value);
  };

  const declared = source.tags.get(trimmed);
  if (declared) {
    for (const alias of declared.aliases) add(alias);
  } else {
    for (const entry of source.tags.values()) {
      if (!entry.aliases.some((alias) => alias.trim() === trimmed)) continue;
      add(entry.displayName);
      for (const alias of entry.aliases) add(alias);
    }
  }

  for (const ref of source.refs.get(trimmed) ?? []) add(ref.target);

  return [...aliases];
}

/**
 * 按角色名与别名匹配章节正文，返回登场章节。
 * 排序：order 升序；order 相同时按传入数组的原始位置稳定排序。
 * 纯函数：同一输入必得同一输出；名字全空返回空列表。
 */
export function findCharacterAppearances(
  name: string,
  chapters: ReadonlyArray<Pick<Chapter, 'id' | 'title' | 'order' | 'content'>>,
  aliases: readonly string[] = [],
): CharacterAppearanceChapter[] {
  const names = normalizeAppearanceNames(name, aliases);
  if (names.length === 0) return [];

  const found: Array<CharacterAppearanceChapter & { index: number }> = [];
  chapters.forEach((chapter, index) => {
    const content = chapter.content ?? '';
    let mentions = 0;
    for (const candidate of names) mentions += countOccurrences(content, candidate);
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
