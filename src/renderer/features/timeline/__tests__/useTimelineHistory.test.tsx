/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

// @vitest-environment jsdom

import type { Chapter, Project } from '@shared/types';
import { act,renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { insertClip } from '../timelineOperations';
import { useTimelineHistory } from '../useTimelineHistory';

function chapter(id: string, order: number, over: Partial<Chapter> = {}): Chapter {
  return { id, title: id, summary: '', content: '', order, ...over };
}

function project(id: string, chapters: Chapter[]): Project {
  return { id, title: '书', chapters } as unknown as Project;
}

describe('useTimelineHistory', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('外部写入（AI/同步）进入撤销栈，撤销回到写入之前', () => {
    const onUpdate = vi.fn();
    const base = [chapter('c1', 0, { content: '原文' })];
    const external = [chapter('c1', 0, { content: 'AI 改过' })];
    const { result, rerender } = renderHook(
      ({ project: value }) => useTimelineHistory(value, onUpdate),
      { initialProps: { project: project('b1', base) } },
    );

    rerender({ project: project('b1', external) });
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(onUpdate).toHaveBeenLastCalledWith({ chapters: base });
  });

  it('自身提交不重复登记为外部改动', () => {
    const onUpdate = vi.fn();
    const base = [chapter('c1', 0)];
    const after = insertClip(base, { index: 1, chapter: chapter('cN', 0), mode: 'ripple' });
    const { result, rerender } = renderHook(
      ({ project: value }) => useTimelineHistory(value, onUpdate),
      { initialProps: { project: project('b1', base) } },
    );

    act(() => result.current.commit({ kind: 'insert', label: '插入', author: 'user' }, after));
    rerender({ project: project('b1', after) });
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    expect(onUpdate).toHaveBeenLastCalledWith({ chapters: base });
  });

  it('撤销栈按书会话持久化，面板卸载再挂载可续', () => {
    const onUpdate = vi.fn();
    const base = [chapter('c1', 0, { content: 'a' })];
    const after = insertClip(base, { index: 1, chapter: chapter('cN', 0), mode: 'ripple' });

    const first = renderHook(
      ({ project: value }) => useTimelineHistory(value, onUpdate),
      { initialProps: { project: project('b1', base) } },
    );
    act(() => first.result.current.commit({ kind: 'insert', label: '插入', author: 'user' }, after));
    first.unmount();

    const second = renderHook(
      ({ project: value }) => useTimelineHistory(value, onUpdate),
      { initialProps: { project: project('b1', after) } },
    );
    expect(second.result.current.canUndo).toBe(true);
    act(() => second.result.current.undo());
    expect(onUpdate).toHaveBeenLastCalledWith({ chapters: base });
  });

  it('切换书籍以新书当前章节重建栈', () => {
    const onUpdate = vi.fn();
    const a = [chapter('a1', 0)];
    const b = [chapter('b1', 0)];
    const { result, rerender } = renderHook(
      ({ project: value }) => useTimelineHistory(value, onUpdate),
      { initialProps: { project: project('b1', a) } },
    );
    expect(result.current.canUndo).toBe(false);
    rerender({ project: project('b2', b) });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
