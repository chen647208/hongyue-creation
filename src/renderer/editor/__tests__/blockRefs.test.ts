/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import {
  backlinksOf,
  type BlockRefChapterInput,
  brokenRefsOf,
  buildBlockRefIndex,
  checkBlockRefInsertion,
  outgoingOf,
  resolveBlockProjection,
} from '../blockRefs';

const chapters: BlockRefChapterInput[] = [
  {
    id: 'c1',
    title: '第一章',
    body: [
      '^a1',
      '甲段内容。',
      '',
      '^a2',
      '引用甲 ((^a1))。',
      '',
      '^a3',
      '!((^a1))',
      '',
      '^a4',
      '引用幽灵 ((^ghost))。',
    ].join('\n'),
  },
  {
    id: 'c2',
    title: '第二章',
    body: ['^b1', '跨章引用 ((^a1))。'].join('\n'),
  },
];

describe('buildBlockRefIndex：正反查与失链', () => {
  const index = buildBlockRefIndex(chapters);

  it('收录全部被锚定的块', () => {
    expect([...index.blocks.keys()].sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'b1']);
    expect(index.blocks.get('a1')).toMatchObject({ chapterId: 'c1', chapterTitle: '第一章' });
  });

  it('反向引用按章序收集引用与嵌入', () => {
    const sources = backlinksOf(index, 'a1').map((s) => `${s.kind}:${s.sourceBlockId}`);
    expect(sources).toEqual(['ref:a2', 'embed:a3', 'ref:b1']);
  });

  it('正向出链只含本块引用', () => {
    expect(outgoingOf(index, 'a2').map((s) => s.targetId)).toEqual(['a1']);
    expect(outgoingOf(index, 'nope')).toEqual([]);
  });

  it('目标缺失进入失链清单', () => {
    expect(index.broken.map((s) => s.targetId)).toEqual(['ghost']);
    expect(brokenRefsOf(index, 'a4').map((s) => s.targetId)).toEqual(['ghost']);
    expect(brokenRefsOf(index, 'a2')).toEqual([]);
  });

  it('嵌入边只记录存在的目标', () => {
    expect(index.embedEdges.get('a3')).toEqual(['a1']);
  });

  it('解析嵌入投影：命中给内容，未命中为 null', () => {
    expect(resolveBlockProjection(index, 'a1')).toMatchObject({ text: '甲段内容。', exists: true, chapterId: 'c1' });
    expect(resolveBlockProjection(index, 'ghost')).toBeNull();
  });

  it('嵌入投影取完整块文本，不按摘要截断', () => {
    const long = '字'.repeat(300);
    const wideIndex = buildBlockRefIndex([{ id: 'c1', title: '第一章', body: `^long\n${long}` }]);
    expect(resolveBlockProjection(wideIndex, 'long')?.text).toBe(long);
    // 面板展示仍用截断摘要（上限 120 + 省略号）。
    expect(wideIndex.blocks.get('long')?.text.length).toBe(121);
  });
});

describe('checkBlockRefInsertion：防自引与嵌入成环', () => {
  const index = buildBlockRefIndex(chapters);

  it('自引被拒绝', () => {
    expect(checkBlockRefInsertion(index, 'a1', 'a1', 'ref')).toEqual({ ok: false, reason: 'self' });
  });

  it('嵌入沿现有嵌入边可达源块即成环', () => {
    // a3 已嵌入 a1；再让 a1 嵌入 a3 会成环。
    expect(checkBlockRefInsertion(index, 'a1', 'a3', 'embed')).toEqual({ ok: false, reason: 'cycle' });
  });

  it('普通引用允许成环，嵌入无环时允许', () => {
    expect(checkBlockRefInsertion(index, 'a1', 'a3', 'ref')).toEqual({ ok: true, reason: 'ok' });
    expect(checkBlockRefInsertion(index, 'b1', 'a1', 'embed')).toEqual({ ok: true, reason: 'ok' });
  });

  it('源块未锚定（无 id）时无从建边，视为允许', () => {
    expect(checkBlockRefInsertion(index, null, 'a1', 'embed')).toEqual({ ok: true, reason: 'ok' });
  });
});
