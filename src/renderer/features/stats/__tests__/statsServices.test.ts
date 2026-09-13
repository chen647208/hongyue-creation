/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Project } from '@shared/types';
import { describe, expect, it } from 'vitest';

import { buildClues } from '../clueService';
import { buildAgeTable } from '../storyMathService';

function makeProject(): Project {
  return {
    id: 'p1',
    title: 'T',
    inspiration: '',
    intro: '',
    outline: '',
    virtualChapters: [],
    knowledge: [],
    lastModified: 0,
    chapters: [
      { id: 'c1', title: '一', summary: '', content: '', order: 0 },
      { id: 'c2', title: '二', summary: '', content: '', order: 1 },
      { id: 'c3', title: '三', summary: '', content: '', order: 2 },
    ],
    characters: [
      { id: 'ch1', name: '甲', gender: 'unknown', age: '', role: 'protagonist', personality: '', background: '', relationships: '', appearance: '', distinctiveFeatures: '', occupation: '', motivation: '', strengths: '', weaknesses: '', characterArc: '', birthDate: { year: 100 } },
    ],
    timeline: {
      id: 'tl',
      projectId: 'p1',
      config: { calendarSystem: 'default' },
      events: [
        { id: 'e1', date: { year: 110 }, title: '加冕', description: '', type: 'plot' },
        { id: 'e2', date: { year: 120 }, title: '远征', description: '', type: 'battle' },
      ],
      createdAt: 0,
      updatedAt: 0,
    },
    foreshadows: [
      { id: 'f1', title: '旧剑', detail: '', status: 'planted', importance: 'major', plantedChapterId: 'c1', payoffChapterId: 'c3', tags: [], createdAt: 0, updatedAt: 0 },
    ],
  };
}

describe('stats 服务', () => {
  it('按故事时间推算年龄', () => {
    const { events, rows } = buildAgeTable(makeProject());
    expect(events.map((event) => event.year)).toEqual([110, 120]);
    expect(rows[0]?.birthYear).toBe(100);
    expect(rows[0]?.ages.map((age) => age.age)).toEqual([10, 20]);
  });

  it('把伏笔映射为章节跨度', () => {
    const clues = buildClues(makeProject());
    expect(clues[0]?.plantedIndex).toBe(0);
    expect(clues[0]?.payoffIndex).toBe(2);
    expect(clues[0]?.span).toBe(2);
  });
});
