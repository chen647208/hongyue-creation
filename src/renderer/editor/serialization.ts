/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 小说正文 DSL ↔ ProseMirror JSON 序列化（06 篇 §1.1「内容序列化走 03 篇 DSL」）。
 *
 * 纯函数、无 DOM 依赖：操作 PM-JSON 普通对象，可无头单测。TipTap 编辑器（schema.ts）
 * 产出的 doc JSON 即此结构；正文（frontmatter 之后的部分）与 DSL 文本双向保真。
 *
 * 行级块：
 *   空行            → 段落分隔
 *   ***             → sceneBreak（场景分隔）
 *   # @role: value  → keywordLine（关键字声明/引用，与真标题以 @ 区分）
 *   #{1,3} text     → heading(level)
 *   其余连续行      → paragraph（段内软换行以 \n 保留）
 * 行内：
 *   [[tag]] / [[tag|显示]] → chapterRef（硬链接）
 *   {name} / {name|kind}   → placeholder（占位符）
 *   ((^id)) / !((^id))     → blockRef / blockEmbed（块引用与嵌入，见 @core/dsl/blockRef）
 *
 * 块锚（docs/design/45 §3）：已有 `blockId` 的块在正文前写一行 `^<id>`，解析时还原为
 * `blockId` 属性并从可见文本剥离；无标识的块不写锚。语法与避让规则见 @core/dsl/anchor。
 *
 * 富文本 marks（em/strong/typography）为编辑器态，不落 DSL（正文禁 Markdown 符号）。
 */

import { formatBlockAnchor, isBlockAnchorId, isBlockAnchorLine, parseBlockAnchor } from '@core/dsl/anchor';
import { formatBlockEmbed, formatBlockRef, isBlockEmbedLine, parseBlockEmbedLine, parseBlockInline } from '@core/dsl/blockRef';

/** 块级节点承载稳定标识的属性名；与 blockId.ts / blockIndex.ts 同源。 */
export const BLOCK_ID_ATTRIBUTE = 'blockId';

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

const KEYWORD_LINE = /^\s*#\s*@([\w-]+):\s*(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const SCENE_BREAK = /^\s*\*\*\*\s*$/;
const WIKI_INLINE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const PLACEHOLDER_INLINE = /\{([^{}|]+)(?:\|([^{}]+))?\}/g;

/** 该行若原样落入 DSL 会被重新解析为块级语法（标题/关键字/场景分隔/块锚/整行嵌入）。 */
function isBlockCollision(line: string): boolean {
  return HEADING.test(line) || KEYWORD_LINE.test(line) || SCENE_BREAK.test(line) || isBlockAnchorLine(line) || isBlockEmbedLine(line);
}

/** 读取块节点的稳定标识；缺失或非法（无法写成锚）时为 null。 */
function blockAnchorOf(node: PmNode): string | null {
  const id = node.attrs?.[BLOCK_ID_ATTRIBUTE];
  return typeof id === 'string' && isBlockAnchorId(id) ? id : null;
}

/** 若块有标识，写入 `blockId` 属性。 */
function withBlockId(node: PmNode, blockId: string | null): PmNode {
  if (blockId === null) return node;
  return { ...node, attrs: { ...(node.attrs ?? {}), [BLOCK_ID_ATTRIBUTE]: blockId } };
}

function textNode(t: string): PmNode {
  return { type: 'text', text: t };
}

/** 解析一段行内文本为 PM 内联节点序列（chapterRef / placeholder / text） */
function parseInline(line: string): PmNode[] {
  const out: PmNode[] = [];
  // 收集所有内联标记的匹配位置，按序切分
  type Hit = { start: number; end: number; node: PmNode };
  const hits: Hit[] = [];
  for (const m of line.matchAll(WIKI_INLINE)) {
    const start = m.index ?? 0;
    hits.push({
      start,
      end: start + m[0].length,
      node: { type: 'chapterRef', attrs: { tag: (m[1] ?? '').trim(), display: (m[2] ?? '').trim() || null } },
    });
  }
  for (const m of line.matchAll(PLACEHOLDER_INLINE)) {
    const start = m.index ?? 0;
    hits.push({
      start,
      end: start + m[0].length,
      node: { type: 'placeholder', attrs: { name: (m[1] ?? '').trim(), kind: (m[2] ?? '').trim() || null } },
    });
  }
  for (const hit of parseBlockInline(line)) {
    hits.push({
      start: hit.start,
      end: hit.end,
      node: { type: hit.kind === 'embed' ? 'blockEmbed' : 'blockRef', attrs: { id: hit.id } },
    });
  }
  hits.sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue; // 与前一标记重叠（如 [[a{b]] 内部的花括号）——跳过
    if (h.start > cursor) out.push(textNode(line.slice(cursor, h.start)));
    out.push(h.node);
    cursor = h.end;
  }
  if (cursor < line.length) out.push(textNode(line.slice(cursor)));
  return out.length > 0 ? out : [textNode('')];
}

function paragraphFromLines(lines: string[]): PmNode {
  const joined = lines.join('\n');
  // 段内软换行：拆成多个内联序列，段间插入 hardBreak
  const segments = joined.split('\n');
  const content: PmNode[] = [];
  segments.forEach((seg, i) => {
    if (i > 0) content.push({ type: 'hardBreak' });
    content.push(...parseInline(seg));
  });
  return { type: 'paragraph', content };
}

/** DSL 正文文本 → PM doc JSON */
export function dslToPmDoc(body: string): PmNode {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks: PmNode[] = [];
  let paraBuf: string[] = [];
  // 待归属的块锚：锚行先于其块出现，遇下一个块时写入该块属性。
  let pendingBlockId: string | null = null;

  const flushPara = () => {
    if (paraBuf.length > 0) {
      blocks.push(withBlockId(paragraphFromLines(paraBuf), pendingBlockId));
      pendingBlockId = null;
      paraBuf = [];
    }
  };

  for (const line of lines) {
    // 反斜杠转义：仅当去掉前导 \ 后本会被解析为块级语法时，视为字面段落文本
    if (line.startsWith('\\') && isBlockCollision(line.slice(1))) {
      paraBuf.push(line.slice(1));
      continue;
    }
    const anchor = parseBlockAnchor(line);
    if (anchor !== null) {
      pendingBlockId = anchor;
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      continue;
    }
    if (SCENE_BREAK.test(line)) {
      flushPara();
      blocks.push(withBlockId({ type: 'sceneBreak' }, pendingBlockId));
      pendingBlockId = null;
      continue;
    }
    const kw = line.match(KEYWORD_LINE);
    if (kw) {
      flushPara();
      blocks.push(withBlockId({ type: 'keywordLine', attrs: { keyword: kw[1] ?? '', value: (kw[2] ?? '').trim() } }, pendingBlockId));
      pendingBlockId = null;
      continue;
    }
    const head = line.match(HEADING);
    if (head) {
      flushPara();
      blocks.push(withBlockId({ type: 'heading', attrs: { level: (head[1] ?? '#').length }, content: parseInline((head[2] ?? '').trim()) }, pendingBlockId));
      pendingBlockId = null;
      continue;
    }
    const embedId = parseBlockEmbedLine(line);
    if (embedId !== null) {
      flushPara();
      blocks.push(withBlockId({ type: 'blockEmbed', attrs: { id: embedId } }, pendingBlockId));
      pendingBlockId = null;
      continue;
    }
    paraBuf.push(line);
  }
  flushPara();

  if (blocks.length === 0) blocks.push(withBlockId({ type: 'paragraph' }, pendingBlockId));
  return { type: 'doc', content: blocks };
}

function renderInline(nodes: PmNode[] | undefined): string {
  if (!nodes) return '';
  let s = '';
  for (const n of nodes) {
    if (n.type === 'text') s += n.text ?? '';
    else if (n.type === 'hardBreak') s += '\n';
    else if (n.type === 'chapterRef') {
      const tag = String(n.attrs?.tag ?? '');
      const display = n.attrs?.display ? String(n.attrs.display) : '';
      s += display ? `[[${tag}|${display}]]` : `[[${tag}]]`;
    } else if (n.type === 'placeholder') {
      const name = String(n.attrs?.name ?? '');
      const kind = n.attrs?.kind ? String(n.attrs.kind) : '';
      s += kind ? `{${name}|${kind}}` : `{${name}}`;
    } else if (n.type === 'blockRef') {
      s += formatBlockRef(String(n.attrs?.id ?? ''));
    } else if (n.type === 'blockEmbed') {
      s += formatBlockEmbed(String(n.attrs?.id ?? ''));
    }
  }
  return s;
}

/** 段落文本逐行转义：任何会被误解析为块级语法的行前置反斜杠，保证往返保真。 */
function escapeParagraphText(text: string): string {
  return text
    .split('\n')
    .map((ln) => (isBlockCollision(ln) ? '\\' + ln : ln))
    .join('\n');
}

/** 写入块锚（若有）+ 块文本 + 段后空行。 */
function pushBlock(lines: string[], node: PmNode, text: string): void {
  const id = blockAnchorOf(node);
  if (id !== null) lines.push(formatBlockAnchor(id));
  lines.push(text);
  lines.push('');
}

/** PM doc JSON → DSL 正文文本（块间以空行分隔，与 dslToPmDoc 往返稳定） */
export function pmDocToDsl(doc: PmNode): string {
  const blocks = doc.content ?? [];
  const lines: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'paragraph':
        pushBlock(lines, b, escapeParagraphText(renderInline(b.content)));
        break;
      case 'heading': {
        const level = Number(b.attrs?.level ?? 1);
        pushBlock(lines, b, '#'.repeat(Math.min(3, Math.max(1, level))) + ' ' + renderInline(b.content));
        break;
      }
      case 'sceneBreak':
        pushBlock(lines, b, '***');
        break;
      case 'keywordLine':
        pushBlock(lines, b, `# @${b.attrs?.keyword ?? ''}: ${b.attrs?.value ?? ''}`.trimEnd());
        break;
      case 'blockEmbed':
        pushBlock(lines, b, formatBlockEmbed(String(b.attrs?.id ?? '')));
        break;
      default:
        // 未知块：尽力渲染其内联内容
        if (b.content) pushBlock(lines, b, renderInline(b.content));
    }
  }
  // 去掉尾部多余空行；不追加尾随换行（编辑器受控内容与源正文对齐，避免尾差抖动）
  return lines.join('\n').replace(/\n+$/, '');
}
