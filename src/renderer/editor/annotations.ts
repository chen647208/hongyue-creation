/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 行内批注（纯函数，docs/design/38 §2.2）：锚定、失锚判定与线程操作。
 *
 * 锚定方式：块稳定标识 + 块内纯文本偏移 + 原文引用（quote）。
 *   - 块存在且偏移处文本与 quote 一致 → 精确锚定；
 *   - 块存在但偏移漂移、quote 仍能在块内唯一找到 → 重定位锚定；
 *   - 块不存在或 quote 丢失 → 失锚（UI 给提示，批注数据保留）。
 *
 * 批注是侧车数据（Chapter.annotations），不写入正文 DSL，因此不进入字数与导出。
 * 本模块只操作数据结构，不含编辑器依赖，可直接单测。
 */

import { uuidv7 } from '@core/entities';

import type { AnnotationAnchor, AnnotationReply, ChapterAnnotation } from '../../shared/types';
import { BLOCK_ID_ATTRIBUTE, blockText } from './blockIndex';
import { dslToPmDoc, type PmNode } from './serialization';

export type AnnotationAnchorStatus = 'anchored' | 'orphaned';
export type AnnotationOrphanReason = 'block-missing' | 'quote-missing' | 'empty-quote';

/** 锚定解析结果：anchored 带有效偏移；orphaned 带原因。 */
export interface ResolvedAnnotation {
  annotationId: string;
  blockId: string;
  status: AnnotationAnchorStatus;
  reason?: AnnotationOrphanReason;
  start: number;
  end: number;
  quote: string;
}

/** 新建批注输入；id/createdAt 缺省时自动生成。 */
export interface CreateAnnotationInput {
  anchor: AnnotationAnchor;
  body: string;
  author: string;
  now?: number;
  id?: string;
}

export interface CreateReplyInput {
  body: string;
  author: string;
  now?: number;
  id?: string;
}

function makeId(prefix: string, id?: string): string {
  return id ?? `${prefix}_${uuidv7()}`;
}

/** 新建一条批注线程。 */
export function createAnnotation(input: CreateAnnotationInput): ChapterAnnotation {
  const now = input.now ?? Date.now();
  return {
    id: makeId('anno', input.id),
    anchor: { ...input.anchor },
    body: input.body,
    author: input.author,
    createdAt: now,
    updatedAt: now,
    resolved: false,
    replies: [],
  };
}

/** 新建一条回复。 */
export function createReply(input: CreateReplyInput): AnnotationReply {
  return {
    id: makeId('reply', input.id),
    body: input.body,
    author: input.author,
    createdAt: input.now ?? Date.now(),
  };
}

/** 章节 body（DSL 文本）→ 块标识到完整纯文本的映射（含无锚块不入表）。 */
export function buildBlockTextMap(body: string): Map<string, string> {
  const doc: PmNode = dslToPmDoc(body ?? '');
  const map = new Map<string, string>();
  for (const node of doc.content ?? []) {
    const id = node.attrs?.[BLOCK_ID_ATTRIBUTE];
    if (typeof id === 'string' && id.length > 0) map.set(id, blockText(node));
  }
  return map;
}

/**
 * 解析批注锚点。quote 在块内重新定位成功即视为已锚定（块重排不改变块内文本）。
 * 入参为 `buildBlockTextMap` 或 `blockIndex` 的文本映射（块 id → 纯文本）。
 */
export function resolveAnnotation(
  annotation: ChapterAnnotation,
  blocks: ReadonlyMap<string, string>,
): ResolvedAnnotation {
  const { blockId, quote } = annotation.anchor;
  const base: ResolvedAnnotation = {
    annotationId: annotation.id,
    blockId,
    status: 'orphaned',
    start: annotation.anchor.start,
    end: annotation.anchor.end,
    quote,
  };

  const text = blocks.get(blockId);
  if (text === undefined) return { ...base, reason: 'block-missing' };
  if (!quote) return { ...base, reason: 'empty-quote' };

  const start = Math.max(0, Math.min(annotation.anchor.start, text.length));
  const end = Math.max(start, Math.min(annotation.anchor.end, text.length));
  if (text.slice(start, end) === quote) {
    return { ...base, status: 'anchored', start, end };
  }

  const found = text.indexOf(quote);
  if (found >= 0) {
    return { ...base, status: 'anchored', start: found, end: found + quote.length };
  }
  return { ...base, reason: 'quote-missing' };
}

/** 批量解析；仅返回待渲染的未解决批注。 */
export function resolveActiveAnnotations(
  annotations: readonly ChapterAnnotation[],
  blocks: ReadonlyMap<string, string>,
): ResolvedAnnotation[] {
  return annotations.filter((a) => !a.resolved).map((a) => resolveAnnotation(a, blocks));
}

function replace(list: readonly ChapterAnnotation[], id: string, fn: (a: ChapterAnnotation) => ChapterAnnotation): ChapterAnnotation[] {
  return list.map((a) => (a.id === id ? fn(a) : a));
}

/** 追加回复。 */
export function addAnnotationReply(
  list: readonly ChapterAnnotation[],
  annotationId: string,
  reply: AnnotationReply,
): ChapterAnnotation[] {
  return replace(list, annotationId, (a) => ({ ...a, replies: [...a.replies, reply], updatedAt: reply.createdAt }));
}

/** 解决批注：置 resolved 并记时间；正文装饰随之移除，历史保留。 */
export function resolveAnnotationThread(
  list: readonly ChapterAnnotation[],
  annotationId: string,
  now: number = Date.now(),
): ChapterAnnotation[] {
  return replace(list, annotationId, (a) => ({ ...a, resolved: true, resolvedAt: now, updatedAt: now }));
}

/** 重开已解决的批注。 */
export function reopenAnnotationThread(
  list: readonly ChapterAnnotation[],
  annotationId: string,
  now: number = Date.now(),
): ChapterAnnotation[] {
  return replace(list, annotationId, (a) => ({ ...a, resolved: false, resolvedAt: undefined, updatedAt: now }));
}

/** 修改批注正文。 */
export function updateAnnotationBody(
  list: readonly ChapterAnnotation[],
  annotationId: string,
  body: string,
  now: number = Date.now(),
): ChapterAnnotation[] {
  return replace(list, annotationId, (a) => ({ ...a, body, updatedAt: now }));
}

/** 删除批注（含回复）。 */
export function deleteAnnotation(list: readonly ChapterAnnotation[], annotationId: string): ChapterAnnotation[] {
  return list.filter((a) => a.id !== annotationId);
}

/** 未解决批注数。 */
export function countUnresolved(list: readonly ChapterAnnotation[]): number {
  return list.reduce((sum, a) => sum + (a.resolved ? 0 : 1), 0);
}
