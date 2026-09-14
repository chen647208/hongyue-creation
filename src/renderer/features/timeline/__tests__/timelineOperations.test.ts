/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Chapter } from '@shared/types';
import { describe, expect, it } from 'vitest';

import { insertClip, moveClip, overwriteClip, removeClip, slideClip, TimelineHistory } from '../timelineOperations';

function chapter(id: string, order: number, over: Partial<Chapter> = {}): Chapter {
  return { id, title: id, summary: '', content: '', order, ...over };
}

describe('非破坏操作', () => {
  it('换轨移动写回轨道与全局 order', () => {
    const tracks = [{ id: 'main', label: '主轨' }, { id: 'sub', label: '支线' }];
    const base = [chapter('c1', 0), chapter('c2', 1), chapter('c3', 2)];
    const moved = moveClip(base, tracks, 'c3', 'sub', 0);
    expect(moved.find((c) => c.id === 'c3')?.trackId).toBe('sub');
    expect(moved.map((c) => c.order)).toEqual([0, 1, 2]);
  });
  it('涟漪插入后移后续片段并重排 order', () => {
    const base = [chapter('c1', 0), chapter('c2', 1)];
    const next = insertClip(base, { index: 1, chapter: chapter('cN', 0), mode: 'ripple' });
    expect(next.map((c) => c.id)).toEqual(['c1', 'cN', 'c2']);
    expect(next.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it('覆盖插入替换同位置片段', () => {
    const base = [chapter('c1', 0), chapter('c2', 1)];
    const next = insertClip(base, { index: 1, chapter: chapter('cN', 0), mode: 'overwrite' });
    expect(next.map((c) => c.id)).toEqual(['c1', 'cN']);
  });

  it('滑动只改目标时长，不超过最小时长', () => {
    const base = [chapter('c1', 0, { duration: 1 }), chapter('c2', 1, { duration: 2 })];
    expect(slideClip(base, 'c1', 3)[0]?.duration).toBe(3);
    expect(slideClip(base, 'c1', 0)[0]?.duration).toBeGreaterThan(0);
    expect(slideClip(base, 'c1', 3)[1]?.duration).toBe(2);
  });

  it('覆盖正文保留位置与其它字段', () => {
    const base = [chapter('c1', 0, { tension: 0.5 })];
    const next = overwriteClip(base, 'c1', '新正文');
    expect(next[0]?.content).toBe('新正文');
    expect(next[0]?.tension).toBe(0.5);
  });

  it('删除片段后重排 order', () => {
    const base = [chapter('c1', 0), chapter('c2', 1), chapter('c3', 2)];
    expect(removeClip(base, 'c2').map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(removeClip(base, 'c2').map((c) => c.order)).toEqual([0, 1]);
  });
});

describe('TimelineHistory 撤销与重做', () => {
  it('撤销完全还原，重做恢复编辑结果', () => {
    const original = [chapter('c1', 0), chapter('c2', 1)];
    const after = insertClip(original, { index: 1, chapter: chapter('cN', 0), mode: 'ripple' });
    const history = new TimelineHistory(original);

    history.record({ kind: 'insert', label: '插入片段', author: 'user' }, after);
    expect(history.current).toEqual(after);
    expect(history.canUndo).toBe(true);

    expect(history.undo()).toEqual(original);
    expect(history.canRedo).toBe(true);

    expect(history.redo()).toEqual(after);
  });

  it('新编辑截断已撤销的重做分支', () => {
    const original = [chapter('c1', 0)];
    const history = new TimelineHistory(original);
    history.record(
      { kind: 'insert', label: 'a', author: 'user' },
      insertClip(original, { index: 1, chapter: chapter('a', 0), mode: 'ripple' }),
    );
    const afterFirst = history.undo();
    expect(afterFirst).toEqual(original);
    const branch = insertClip(original, { index: 1, chapter: chapter('b', 0), mode: 'ripple' });
    history.record({ kind: 'insert', label: 'b', author: 'user' }, branch);
    expect(history.canRedo).toBe(false);
    expect(history.current).toEqual(branch);
  });

  it('空栈时撤销与重做返回 null', () => {
    const history = new TimelineHistory([chapter('c1', 0)]);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });
});
