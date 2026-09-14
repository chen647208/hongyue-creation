/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 小说 DSL 关键字解析（novelWriter 关键字表，前缀 % 改 @ 以与代码注释区分）。
 * 正文即事实来源：关键字行保留在 body 中，解析结果只进索引，不回写。
 *
 *   # @tag: 林渊 | 林师兄          —— 标签声明（全库唯一，| 后为别名）
 *   # @pov: 林渊, 苏雪             —— 关键字引用（逗号分隔多个目标）
 *   [[云都]] / [[云都|云端帝都]]    —— 硬链接（改名联动，kind=link-hard）
 */

/** 关键字 → 索引角色名。tag 为声明专用，不入 references。 */
export const KEYWORD_ROLES: Record<string, string> = {
  pov: 'pov',
  character: 'character',
  location: 'location',
  plot: 'plot',
  strand: 'strand',
  object: 'object',
  entity: 'entity',
  'timeline-ref': 'timeline',
  'foreshadow-ref': 'foreshadow',
  custom: 'custom',
};

export const TAG_KEYWORD = 'tag';

export interface TagDeclaration {
  tag: string;
  aliases: string[];
  line: number;
}

export interface KeywordReference {
  keyword: string;
  role: string;
  targets: string[];
  line: number;
}

export interface WikiLink {
  tag: string;
  display?: string;
  line: number;
}

export interface KeywordParseResult {
  declarations: TagDeclaration[];
  references: KeywordReference[];
  wikiLinks: WikiLink[];
}

const KEYWORD_LINE = /^\s*#\s*@([\w-]+):\s*(.+)$/;
const WIKI_LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** 解析正文中的声明、引用与硬链接（逐行，行号 1 起） */
export function parseKeywords(body: string): KeywordParseResult {
  const declarations: TagDeclaration[] = [];
  const references: KeywordReference[] = [];
  const wikiLinks: WikiLink[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = line.match(KEYWORD_LINE);
    if (m) {
      const keyword = m[1] ?? '';
      const value = (m[2] ?? '').trim();
      if (keyword === TAG_KEYWORD) {
        const [primary, ...aliases] = value.split('|').map((s) => s.trim()).filter(Boolean);
        // 别名段内再按逗号拆分（"林师兄, 小渊" 与 "林师兄 | 小渊" 等价）
        const flatAliases = aliases.flatMap((a) => a.split(',').map((s) => s.trim()).filter(Boolean));
        if (primary) declarations.push({ tag: primary, aliases: flatAliases, line: i + 1 });
      } else {
        const role = KEYWORD_ROLES[keyword];
        if (role) {
          const targets = value.split(',').map((s) => s.trim()).filter(Boolean);
          if (targets.length > 0) {
            references.push({ keyword, role, targets, line: i + 1 });
          }
        }
      }
    }
    // wiki 链接可出现在任意行（含关键字行之后）
    for (const wm of line.matchAll(WIKI_LINK)) {
      wikiLinks.push({ tag: (wm[1] ?? '').trim(), display: wm[2]?.trim(), line: i + 1 });
    }
  }
  return { declarations, references, wikiLinks };
}

/**
 * 抽取全部 `# @键: 值` 行（不限已知关键字），键为关键字名、值为行内原文。
 * 供视图投影把章节正文里的自定义字段（如分镜的 画面/景别）暴露为行字段；
 * 同一关键字重复出现时后者覆盖前者。
 */
const ANY_KEYWORD_LINE = /^\s*#\s*@([^\s:：]+)\s*[:：]\s*(.+)$/;

export function parseKeywordAttributes(body: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const m = line.match(ANY_KEYWORD_LINE);
    if (!m) continue;
    const keyword = (m[1] ?? '').trim();
    const value = (m[2] ?? '').trim();
    if (!keyword || value === '') continue;
    attributes[keyword] = value;
  }
  return attributes;
}
