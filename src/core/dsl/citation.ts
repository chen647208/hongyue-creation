/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 引文与脚注的正文语法（docs/design/41 §1、§2）。
 *
 *   [@key]              —— 引用一条来源（citekey）
 *   [@key1; @key2]      —— 同一处引用多条来源
 *   [@key|定位]         —— 带定位（页码/章节），定位内允许除 ] ; 外的任意字符
 *   ^[注释内容]         —— 行内脚注；内容不跨行、不嵌套方括号
 *
 * 语法解析只做词法切分，不解释来源；编号、失链与文献表由编译层
 * （core/build/references）按正文出现顺序统一处理。
 */

/** 一处引用组：方括号内以分号分隔的单条或多条 @key。 */
const CITATION_GROUP = /\[(?:@[A-Za-z0-9_.:-]+(?:\|[^\];]*)?)(?:\s*;\s*@[A-Za-z0-9_.:-]+(?:\|[^\];]*)?)*\]/g;

/** 行内脚注命中：`^[内容]`。 */
const FOOTNOTE = /\^\[([^\]\n]*)\]/g;

export interface CitationItem {
  key: string;
  /** 定位（页码/章节），可选。 */
  locator?: string;
}

export interface CitationHit {
  items: CitationItem[];
  /** 命中起点（相对传入文本）。 */
  start: number;
  /** 命中终点（不含）。 */
  end: number;
}

export interface FootnoteHit {
  content: string;
  start: number;
  end: number;
}

/** 解析一行文本内的全部引文命中，按出现顺序返回。 */
export function parseCitations(text: string): CitationHit[] {
  const out: CitationHit[] = [];
  for (const match of text.matchAll(CITATION_GROUP)) {
    const start = match.index ?? 0;
    const inner = match[0].slice(1, -1);
    const items: CitationItem[] = [];
    for (const part of inner.split(';')) {
      const parsed = part.trim().match(/^@([A-Za-z0-9_.:-]+)(?:\|([\s\S]*))?$/);
      const key = parsed?.[1];
      if (!key) continue;
      const locator = parsed[2]?.trim();
      items.push(locator ? { key, locator } : { key });
    }
    if (items.length > 0) out.push({ items, start, end: start + match[0].length });
  }
  return out;
}

/**
 * 解析行内脚注命中。反斜杠转义（`\^[`）按字面处理，前后奇偶个反斜杠判定，
 * 与块锚/块引用的转义口径同构：解析结果与“从未写脚注”的正文一致。
 */
export function parseFootnotes(text: string): FootnoteHit[] {
  const out: FootnoteHit[] = [];
  for (const match of text.matchAll(FOOTNOTE)) {
    const start = match.index ?? 0;
    if (isEscaped(text, start)) continue;
    out.push({ content: match[1] ?? '', start, end: start + match[0].length });
  }
  return out;
}

/** 位置 start 是否被反斜杠转义（其前连续的 `\` 个数为奇数）。 */
function isEscaped(text: string, start: number): boolean {
  let backslashes = 0;
  for (let i = start - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 1;
}

/** 生成一条引文标记文本；定位存在时以 `|` 拼接。 */
export function formatCitation(key: string, locator?: string): string {
  return locator ? `[@${key}|${locator}]` : `[@${key}]`;
}

/** 生成一行内脚注标记文本。 */
export function formatFootnote(content: string): string {
  return `^[${content}]`;
}
