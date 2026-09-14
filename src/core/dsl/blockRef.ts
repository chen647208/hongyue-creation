/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 块引用与块嵌入（docs/design/45 §4）。
 *
 * 语法（行内）：
 *   ((^<id>))   块引用：指向块锚 `^<id>` 的链接，显示上下文预览
 *   !((^<id>))  块嵌入：把块锚 `^<id>` 的正文投影到当前位置，不复制内容
 * 单独成行的 `!((^<id>))` 按块级嵌入处理，其余位置按行内处理。
 *
 * id 复用块锚字符集（见 anchor.ts），引用因此与块锚同源，不需要第二套标识。
 *
 * 持久化：引用/嵌入只写入 id，不写入被引内容；内容由投影层（编辑器 NodeView、
 * 反向引用面板、编译管线）按 id 实时解析。导出时引用与嵌入统一展开为被引块的可见文本，
 * 目标缺失写失链标记，成环写循环引用标记，产物中不残留 `((^id))` 语法。
 */

import { isBlockAnchorId, isBlockAnchorLine, parseBlockAnchor } from './anchor';

/** 行内块引用/嵌入匹配：捕获组 1 为嵌入 id，组 2 为引用 id。 */
const BLOCK_INLINE = /!\(\(\^([A-Za-z0-9][A-Za-z0-9_-]*)\)\)|\(\(\^([A-Za-z0-9][A-Za-z0-9_-]*)\)\)/g;

/** 整行嵌入：`!((^id))` 前后允许空白。 */
const BLOCK_EMBED_LINE = /^\s*!\(\(\^([A-Za-z0-9][A-Za-z0-9_-]*)\)\)\s*$/;

/** 块级语法正则，与 serialization.ts 的 DSL 语法同源（标题/关键字/场景分隔）。 */
const HEADING = /^(#{1,3})\s+(.*)$/;
const KEYWORD_LINE = /^\s*#\s*@([\w-]+):\s*(.*)$/;
const SCENE_BREAK = /^\s*\*\*\*\s*$/;

/** 块级语法判定，与 serialization.ts 的 DSL 语法同源（标题/关键字/场景分隔/块锚/整行嵌入）。 */
function isBlockSyntax(line: string): boolean {
  return HEADING.test(line) || KEYWORD_LINE.test(line) || SCENE_BREAK.test(line) || isBlockAnchorLine(line) || isBlockEmbedLine(line);
}

/** 引用与嵌入共用的 id 约束。 */
export function isBlockRefId(id: string): boolean {
  return isBlockAnchorId(id);
}

/** 块引用 → `((^id))` 文本。 */
export function formatBlockRef(id: string): string {
  return `((^${id}))`;
}

/** 块嵌入 → `!((^id))` 文本。 */
export function formatBlockEmbed(id: string): string {
  return `!((^${id}))`;
}

export type BlockRefKind = 'ref' | 'embed';

export interface BlockRefHit {
  kind: BlockRefKind;
  id: string;
  /** 命中起点（相对传入文本）。 */
  start: number;
  /** 命中终点（不含）。 */
  end: number;
}

/** 解析一段文本中的全部块引用/嵌入命中，按出现顺序返回。 */
export function parseBlockInline(text: string): BlockRefHit[] {
  const out: BlockRefHit[] = [];
  for (const m of text.matchAll(BLOCK_INLINE)) {
    const start = m.index ?? 0;
    const embedId = m[1];
    const refId = m[2];
    out.push({
      kind: embedId !== undefined ? 'embed' : 'ref',
      id: (embedId ?? refId) ?? '',
      start,
      end: start + m[0].length,
    });
  }
  return out;
}

/** 该行是否为整行块嵌入（`!((^id))`）。 */
export function isBlockEmbedLine(line: string): boolean {
  return BLOCK_EMBED_LINE.test(line);
}

/** 整行块嵌入 → id；非整行嵌入返回 null。 */
export function parseBlockEmbedLine(line: string): string | null {
  return line.match(BLOCK_EMBED_LINE)?.[1] ?? null;
}

export interface BlockRefOccurrence {
  kind: BlockRefKind;
  id: string;
  /** 行号，1 起。 */
  line: number;
}

/** 逐行解析正文中的块引用/嵌入（用于反向引用与失链报告）。 */
export function parseBlockRefs(body: string): BlockRefOccurrence[] {
  const out: BlockRefOccurrence[] = [];
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const hit of parseBlockInline(lines[i] ?? '')) {
      out.push({ kind: hit.kind, id: hit.id, line: i + 1 });
    }
  }
  return out;
}

interface ScannedBlock {
  id: string | null;
  text: string;
}

/**
 * 把正文切成块并给出每块的可见文本（DSL 原文，不含其块锚行）。
 * 边界规则与 serialization.ts 的 dslToPmDoc 对齐：锚行归属其后块、空行分段、
 * 标题/关键字/场景分隔各自成块。
 */
function scanBlocks(body: string): ScannedBlock[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const out: ScannedBlock[] = [];
  let pendingId: string | null = null;
  let buf: string[] = [];

  const flushPara = () => {
    if (buf.length === 0) return;
    out.push({ id: pendingId, text: buf.join('\n') });
    pendingId = null;
    buf = [];
  };

  for (const line of lines) {
    // 反斜杠转义：去掉前导 \ 后为块级语法时按字面文本处理（与 serialization.ts 一致）。
    if (line.startsWith('\\') && line.length > 1 && isBlockSyntax(line.slice(1))) {
      buf.push(line.slice(1));
      continue;
    }
    const anchor = parseBlockAnchor(line);
    if (anchor !== null) {
      pendingId = anchor;
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      continue;
    }
    if (SCENE_BREAK.test(line)) {
      flushPara();
      out.push({ id: pendingId, text: '***' });
      pendingId = null;
      continue;
    }
    if (KEYWORD_LINE.test(line) || HEADING.test(line)) {
      flushPara();
      out.push({ id: pendingId, text: line.trim() });
      pendingId = null;
      continue;
    }
    buf.push(line);
  }
  flushPara();
  if (pendingId !== null) out.push({ id: pendingId, text: '' });
  return out;
}

/** 汇总多份正文中被锚定块的可见文本（同 id 以首个为准）。 */
export function collectBlockTexts(bodies: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const body of bodies) {
    for (const block of scanBlocks(body)) {
      if (block.id !== null && !out.has(block.id)) out.set(block.id, block.text);
    }
  }
  return out;
}

export interface BlockRefResolveOptions {
  /** 目标缺块时的替换文本，默认 `【失链：<id>】`。 */
  broken?: (id: string) => string;
  /** 展开成环时的替换文本，默认 `【循环引用：<id>】`。 */
  cycle?: (id: string) => string;
}

function expand(
  text: string,
  texts: ReadonlyMap<string, string>,
  stack: ReadonlySet<string>,
  options: BlockRefResolveOptions,
): string {
  const broken = options.broken ?? ((id: string) => `【失链：${id}】`);
  const cycle = options.cycle ?? ((id: string) => `【循环引用：${id}】`);
  return text.replace(BLOCK_INLINE, (_match, embedId: string | undefined, refId: string | undefined) => {
    const id = embedId ?? refId ?? '';
    if (stack.has(id)) return cycle(id);
    const source = texts.get(id);
    if (source === undefined) return broken(id);
    const next = new Set(stack);
    next.add(id);
    return expand(source, texts, next, options);
  });
}

/**
 * 把引用/嵌入展开为被引块的可见文本（编译/导出与字数统计统一口径）。
 * 目标缺失写失链标记；成环时以 visited 集合截断，保证不死循环。无语法时原样返回。
 */
export function resolveBlockRefs(
  body: string,
  texts: ReadonlyMap<string, string>,
  options: BlockRefResolveOptions = {},
): string {
  if (!body.includes('((')) return body;
  return expand(body, texts, new Set(), options);
}
