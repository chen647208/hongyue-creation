/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 交叉引用语法（docs/design/41 §3）：正文可引用章节/图表的编号。
 *
 *   ((#<目标>))            编号引用，默认模板按目标类型回落（章节 `%N`，图表 `图 %N`）
 *   ((#<目标>|<模板>))      自定义模板，`%N` 替换为编号、`%T` 替换为标题/图注
 *   # @figure: <标签> | <图注>   图表声明；`| <图注>` 可省
 *
 * 编号在编译期按结构重算（章节重编号、图表按正文出现顺序），目标缺失写失链标记。
 * 与块引用 `((^id))` 同族但前缀不同（`#` vs `^`），互不解析。
 */

/** 交叉引用目标字符集：ASCII 标识与中文标题均可作目标。 */
const CROSS_REF_TARGET = '[A-Za-z0-9_.:\\-\\u4e00-\\u9fff]+';

/** 行内交叉引用匹配：捕获组 1 为目标，组 2 为可选模板。 */
const CROSS_REF = new RegExp(`\\(\\(#(${CROSS_REF_TARGET})(?:\\|([^)]*))?\\)\\)`, 'g');

/** 图表声明行：`# @figure: 标签 | 图注`（图注可省）。 */
const FIGURE_DECL = /^\s*#\s*@figure\s*[:：]\s*([^\s|]+)\s*(?:\|\s*(.*?))?\s*$/;

export interface CrossRefHit {
  target: string;
  /** 用户模板；缺席时按目标类型回落。 */
  template?: string;
  start: number;
  end: number;
}

export interface FigureDeclaration {
  label: string;
  caption?: string;
  /** 行号，1 起。 */
  line: number;
}

export interface CrossRefTarget {
  kind: 'chapter' | 'figure';
  /** 编号，1 起。 */
  number: number;
  title: string;
}

/** 交叉引用 → 文本。 */
export function formatCrossRef(target: string, template?: string): string {
  return template ? `((#${target}|${template}))` : `((#${target}))`;
}

/** 解析一段文本内的全部交叉引用，按出现顺序返回。 */
export function parseCrossRefs(text: string): CrossRefHit[] {
  const out: CrossRefHit[] = [];
  for (const match of text.matchAll(CROSS_REF)) {
    const start = match.index ?? 0;
    const hit: CrossRefHit = { target: match[1] ?? '', start, end: start + match[0].length };
    const raw = match[2];
    if (raw !== undefined && raw !== '') hit.template = raw;
    out.push(hit);
  }
  return out;
}

/** 逐行解析图表声明（行号 1 起）。 */
export function parseFigureDeclarations(body: string): FigureDeclaration[] {
  const out: FigureDeclaration[] = [];
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = (lines[i] ?? '').match(FIGURE_DECL);
    if (!m) continue;
    const caption = m[2]?.trim();
    out.push(caption ? { label: m[1] ?? '', caption, line: i + 1 } : { label: m[1] ?? '', line: i + 1 });
  }
  return out;
}

/** 替换模板占位符：`%N` 编号、`%T` 标题。 */
function applyTemplate(template: string, target: CrossRefTarget): string {
  return template.replace(/%N/g, String(target.number)).replace(/%T/g, target.title).trim();
}

/**
 * 就地解析交叉引用：命中已登记目标则按模板替换，缺失写失链标记。
 * `targets` 键为场景/章节 id、标题或图表标签；编号由调用方按结构重算后提供。
 */
export function resolveCrossRefs(text: string, targets: ReadonlyMap<string, CrossRefTarget>): string {
  if (!text.includes('((#')) return text;
  return text.replace(CROSS_REF, (_match, rawTarget: string, rawTemplate: string | undefined) => {
    const target = targets.get(rawTarget);
    if (!target) return `【失链引用：${rawTarget}】`;
    const fallback = target.kind === 'figure' ? `图 %N` : `%N`;
    const template = rawTemplate && rawTemplate !== '' ? rawTemplate : fallback;
    return applyTemplate(template, target);
  });
}

/** 交叉引用目标是否合法：ASCII 标识或中文标题。 */
export function isCrossRefTargetId(id: string): boolean {
  return new RegExp(`^${CROSS_REF_TARGET}$`).test(id);
}
