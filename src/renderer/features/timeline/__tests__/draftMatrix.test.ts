/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Chapter, Project } from '@shared/types';
import { describe, expect, it } from 'vitest';

import { commitDraftMatrix, moveInDraftMatrix, projectDraftMatrix, sameMatrix } from '../draftMatrix';
import { buildTimelineModel, reorderChapters } from '../timelineModel';

function chapter(id: string, order: number, over: Partial<Chapter> = {}): Chapter {
  return { id, title: id, summary: '', content: '', order, ...over };
}

function project(chapters: Chapter[]): Project {
  return {
    id: 'p1',
    title: 'T',
    inspiration: '',
    intro: '',
    characters: [],
    outline: '',
    chapters,
    virtualChapters: [],
    knowledge: [],
    lastModified: 0,
    timelineTracks: [{ id: 'main', label: '主轨' }, { id: 'sub', label: '支线' }],
  };
}

describe('草稿矩阵与成稿轨道同源', () => {
  it('从 chapters 投影，提交后完全一致（同源闭环）', () => {
    const p = project([
      chapter('c1', 0),
      chapter('c2', 1, { trackId: 'sub' }),
      chapter('c3', 2),
    ]);
    const matrix = projectDraftMatrix(p);
    expect(matrix.lanes).toEqual([
      { trackId: 'main', clipIds: ['c1', 'c3'] },
      { trackId: 'sub', clipIds: ['c2'] },
    ]);
    const committed = commitDraftMatrix(p.chapters, matrix);
    expect(sameMatrix(projectDraftMatrix({ ...p, chapters: committed }), matrix)).toBe(true);
    expect(committed.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it('矩阵改一处，成稿轨道随之一致', () => {
    const p = project([
      chapter('c1', 0),
      chapter('c2', 1),
      chapter('c3', 2),
    ]);
    let matrix = projectDraftMatrix(p);
    matrix = moveInDraftMatrix(matrix, 'c3', 'sub', 0);
    const committed = commitDraftMatrix(p.chapters, matrix);
    const next = { ...p, chapters: committed };

    expect(sameMatrix(projectDraftMatrix(next), matrix)).toBe(true);
    const narrative = buildTimelineModel(next).axes.find((axis) => axis.id === 'narrative')?.clips ?? [];
    const flattened = matrix.lanes.flatMap((lane) => lane.clipIds);
    expect(narrative.map((clip) => clip.entityId)).toEqual(flattened);
    expect(committed.find((c) => c.id === 'c3')?.trackId).toBe('sub');
  });

  it('直接改 chapters 后矩阵投影同步（单一真源）', () => {
    const p = project([
      chapter('c1', 0),
      chapter('c2', 1),
      chapter('c3', 2),
    ]);
    const reordered = reorderChapters(p.chapters, p.timelineTracks ?? [], 'c3', 'main', 0);
    const matrix = projectDraftMatrix({ ...p, chapters: reordered });
    expect(matrix.lanes[0]?.clipIds).toEqual(['c3', 'c1', 'c2']);
  });
});
