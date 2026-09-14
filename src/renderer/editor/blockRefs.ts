/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 块引用图（docs/design/45 §4）：扫描全书正文，构建「谁引用了谁」的正反查、失链清单与
 * 嵌入边，供反向引用面板、插入前防环与嵌入投影消费。纯函数：同一输入必得同一结果。
 */

import { collectBlockTexts } from '@core/dsl/blockRef';

import { BLOCK_ID_ATTRIBUTE, blockText, listBlocksFromBody } from './blockIndex';
import { dslToPmDoc, type PmNode } from './serialization';

export interface BlockRefChapterInput {
  id: string;
  title: string;
  /** 章节正文（DSL 文本）。 */
  body: string;
}

export interface BlockLocation {
  id: string;
  chapterId: string;
  chapterTitle: string;
  /** 块文本摘要（截断，见 blockIndex）。 */
  text: string;
}

export interface BlockRefSite {
  kind: 'ref' | 'embed';
  targetId: string;
  /** 引用所在块 id；无块锚时为 null。 */
  sourceBlockId: string | null;
  /** 引用所在块的摘要。 */
  sourceText: string;
  chapterId: string;
  chapterTitle: string;
}

export interface BlockRefIndex {
  /** 块 id → 位置信息（所有被锚定的块）。 */
  blocks: Map<string, BlockLocation>;
  /** 块 id → 块完整可见文本（嵌入投影用，不截断）。 */
  fullTexts: Map<string, string>;
  /** 目标块 id → 引用它的位置（反向引用）。 */
  backlinks: Map<string, BlockRefSite[]>;
  /** 源块 id → 它引用的位置（正向引用）。 */
  outgoing: Map<string, BlockRefSite[]>;
  /** 目标缺失的引用位置（失链）。 */
  broken: BlockRefSite[];
  /** 嵌入边：源块 id → 被嵌入的目标块 id。 */
  embedEdges: Map<string, string[]>;
}

interface InlineRef {
  kind: 'ref' | 'embed';
  targetId: string;
}

function collectInlineRefs(nodes: PmNode[] | undefined, out: InlineRef[]): void {
  for (const node of nodes ?? []) {
    if (node.type === 'blockRef' || node.type === 'blockEmbed') {
      const id = node.attrs?.id;
      if (typeof id === 'string' && id.length > 0) {
        out.push({ kind: node.type === 'blockEmbed' ? 'embed' : 'ref', targetId: id });
      }
      continue;
    }
    collectInlineRefs(node.content, out);
  }
}

function sitesForChapter(chapter: BlockRefChapterInput): BlockRefSite[] {
  const doc = dslToPmDoc(chapter.body);
  const sites: BlockRefSite[] = [];
  for (const block of doc.content ?? []) {
    const refs: InlineRef[] = [];
    // 整行嵌入是顶层原子块，其目标在自身属性上，不在 content 里。
    if (block.type === 'blockEmbed') {
      const id = block.attrs?.id;
      if (typeof id === 'string' && id.length > 0) refs.push({ kind: 'embed', targetId: id });
    }
    collectInlineRefs(block.content, refs);
    if (refs.length === 0) continue;
    const rawId = block.attrs?.[BLOCK_ID_ATTRIBUTE];
    const sourceBlockId = typeof rawId === 'string' && rawId.length > 0 ? rawId : null;
    const sourceText = blockText(block);
    for (const ref of refs) {
      sites.push({
        kind: ref.kind,
        targetId: ref.targetId,
        sourceBlockId,
        sourceText,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
      });
    }
  }
  return sites;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** 全书块引用图构建（纯函数）。 */
export function buildBlockRefIndex(chapters: readonly BlockRefChapterInput[]): BlockRefIndex {
  const blocks = new Map<string, BlockLocation>();
  const backlinks = new Map<string, BlockRefSite[]>();
  const outgoing = new Map<string, BlockRefSite[]>();
  const embedEdges = new Map<string, string[]>();
  const broken: BlockRefSite[] = [];

  for (const chapter of chapters) {
    for (const record of listBlocksFromBody(chapter.body)) {
      if (record.id !== null && !blocks.has(record.id)) {
        blocks.set(record.id, {
          id: record.id,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          text: record.text,
        });
      }
    }
  }

  for (const chapter of chapters) {
    for (const site of sitesForChapter(chapter)) {
      const exists = blocks.has(site.targetId);
      if (exists) push(backlinks, site.targetId, site);
      else broken.push(site);
      if (site.sourceBlockId !== null) {
        push(outgoing, site.sourceBlockId, site);
        if (site.kind === 'embed' && exists) push(embedEdges, site.sourceBlockId, site.targetId);
      }
    }
  }

  return { blocks, fullTexts: collectBlockTexts(chapters.map((c) => c.body)), backlinks, outgoing, broken, embedEdges };
}

/** 目标缺失的引用（失链）；给定源块时只看该块的出链。 */
export function brokenRefsOf(index: BlockRefIndex, sourceBlockId: string | null): BlockRefSite[] {
  if (sourceBlockId === null) return index.broken;
  return index.broken.filter((site) => site.sourceBlockId === sourceBlockId);
}

export function backlinksOf(index: BlockRefIndex, blockId: string | null): BlockRefSite[] {
  if (blockId === null) return [];
  return index.backlinks.get(blockId) ?? [];
}

export function outgoingOf(index: BlockRefIndex, blockId: string | null): BlockRefSite[] {
  if (blockId === null) return [];
  return index.outgoing.get(blockId) ?? [];
}

export type BlockRefInsertionReason = 'ok' | 'self' | 'cycle';

export interface BlockRefInsertionCheck {
  ok: boolean;
  reason: BlockRefInsertionReason;
}

/**
 * 插入前防环：引用禁止自引；嵌入沿现有嵌入边从目标可达源块时判为成环。
 * 源块无 id（未锚定）时无从建立边，视为允许。
 */
export function checkBlockRefInsertion(
  index: BlockRefIndex,
  sourceBlockId: string | null,
  targetId: string,
  kind: 'ref' | 'embed',
): BlockRefInsertionCheck {
  if (sourceBlockId !== null && sourceBlockId === targetId) return { ok: false, reason: 'self' };
  if (kind === 'ref' || sourceBlockId === null) return { ok: true, reason: 'ok' };
  const seen = new Set<string>();
  const stack = [targetId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === sourceBlockId) return { ok: false, reason: 'cycle' };
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of index.embedEdges.get(current) ?? []) stack.push(next);
  }
  return { ok: true, reason: 'ok' };
}

export interface ResolvedBlockProjection {
  text: string;
  exists: boolean;
  chapterId: string | null;
}

/** 按块 id 解析嵌入投影（编辑器 NodeView 消费）；未命中为 null。 */
export function resolveBlockProjection(index: BlockRefIndex, id: string): ResolvedBlockProjection | null {
  const location = index.blocks.get(id);
  if (!location) return null;
  return { text: index.fullTexts.get(id) ?? location.text, exists: true, chapterId: location.chapterId };
}
