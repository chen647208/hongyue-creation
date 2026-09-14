/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { AnnotationAnchor, ChapterAnnotation } from '../../../shared/types';
import {
  addAnnotationReply,
  buildBlockTextMap,
  countUnresolved,
  createAnnotation,
  createReply,
  deleteAnnotation,
  reopenAnnotationThread,
  resolveAnnotation,
  resolveAnnotationThread,
  updateAnnotationBody,
} from '../annotations';

const anchor = (over: Partial<AnnotationAnchor> = {}): AnnotationAnchor => ({
  blockId: 'b1',
  start: 0,
  end: 2,
  quote: '林渊',
  ...over,
});

const blocks = new Map<string, string>([['b1', '林渊推门，雨很大']]);

describe('resolveAnnotation', () => {
  it('偏移处文本与 quote 一致即精确锚定', () => {
    const a = createAnnotation({ anchor: anchor(), body: '改一下', author: 'user', now: 1 });
    const r = resolveAnnotation(a, blocks);
    expect(r.status).toBe('anchored');
    expect([r.start, r.end]).toEqual([0, 2]);
  });

  it('偏移漂移但 quote 仍在块内时重定位', () => {
    const a = createAnnotation({ anchor: anchor({ start: 3, end: 5, quote: '雨很' }), body: 'x', author: 'user', now: 1 });
    const r = resolveAnnotation(a, blocks);
    expect(r.status).toBe('anchored');
    expect([r.start, r.end]).toEqual([5, 7]);
    expect(blocks.get('b1')!.slice(r.start, r.end)).toBe('雨很');
  });

  it('块不存在判为失锚 block-missing', () => {
    const a = createAnnotation({ anchor: anchor({ blockId: 'gone' }), body: 'x', author: 'user', now: 1 });
    const r = resolveAnnotation(a, blocks);
    expect(r.status).toBe('orphaned');
    expect(r.reason).toBe('block-missing');
  });

  it('quote 在块内丢失判为失锚 quote-missing', () => {
    const a = createAnnotation({ anchor: anchor({ quote: '不存在' }), body: 'x', author: 'user', now: 1 });
    const r = resolveAnnotation(a, blocks);
    expect(r.status).toBe('orphaned');
    expect(r.reason).toBe('quote-missing');
  });

  it('空 quote 判为失锚 empty-quote', () => {
    const a = createAnnotation({ anchor: anchor({ quote: '' }), body: 'x', author: 'user', now: 1 });
    expect(resolveAnnotation(a, blocks).reason).toBe('empty-quote');
  });
});

describe('buildBlockTextMap', () => {
  it('按块锚提取块内完整纯文本', () => {
    const map = buildBlockTextMap('^b1\n林渊推门，雨很大\n\n^b2\n他抬头看天。');
    expect(map.get('b1')).toBe('林渊推门，雨很大');
    expect(map.get('b2')).toBe('他抬头看天。');
    expect(map.has('nope')).toBe(false);
  });
});

describe('线程操作', () => {
  const seed = (): ChapterAnnotation[] => [
    createAnnotation({ anchor: anchor(), body: '第一条', author: 'user', now: 1, id: 'a1' }),
    createAnnotation({ anchor: anchor({ blockId: 'b2', quote: '天' }), body: '第二条', author: 'user', now: 2, id: 'a2' }),
  ];

  it('追加回复与计数', () => {
    const next = addAnnotationReply(seed(), 'a1', createReply({ body: '回复', author: 'user', now: 3, id: 'r1' }));
    expect(next[0]!.replies).toHaveLength(1);
    expect(next[0]!.replies[0]!.body).toBe('回复');
    expect(countUnresolved(next)).toBe(2);
  });

  it('解决后计数下降，重开恢复', () => {
    const resolved = resolveAnnotationThread(seed(), 'a1', 5);
    expect(resolved[0]!.resolved).toBe(true);
    expect(resolved[0]!.resolvedAt).toBe(5);
    expect(countUnresolved(resolved)).toBe(1);
    const reopened = reopenAnnotationThread(resolved, 'a1', 6);
    expect(reopened[0]!.resolved).toBe(false);
    expect(reopened[0]!.resolvedAt).toBeUndefined();
    expect(countUnresolved(reopened)).toBe(2);
  });

  it('修改正文与删除', () => {
    const edited = updateAnnotationBody(seed(), 'a2', '改过', 9);
    expect(edited[1]!.body).toBe('改过');
    expect(edited[1]!.updatedAt).toBe(9);
    const removed = deleteAnnotation(seed(), 'a1');
    expect(removed.map((a) => a.id)).toEqual(['a2']);
  });
});
