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

import { buildEntityView } from '../buildEntityView';
import { findViewPreset } from '../viewPresets';
import { applyViewQuery } from '../viewQuery';

function makeProject(): Project {
  return {
    id: 'p1',
    title: 'T',
    inspiration: '',
    intro: '',
    outline: '',
    lastModified: 0,
    characters: [],
    knowledge: [
      { id: 'k1', name: '灵感一', content: '正文', type: 'text', size: 2, addedAt: 5, category: 'inspiration' },
    ],
    virtualChapters: [],
    chapters: [
      {
        id: 'ch1',
        title: '镜头 1',
        summary: '细纲',
        order: 0,
        status: 'draft',
        content: ['# @画面: 夜色中的城墙', '# @景别: 远景', '# @镜头运动: 推', '# @时长: 4', '# @台词: 你好'].join('\n'),
      },
    ],
    foreshadows: [
      { id: 'f1', title: '断剑', detail: '回收于终章', status: 'planted', importance: 'major', tags: ['剑'], createdAt: 0, updatedAt: 0 },
    ],
    ruleSystems: [
      { id: 'r1', projectId: 'p1', type: 'cultivation', name: '灵阶', description: 'desc', levels: [], createdAt: 0, updatedAt: 0 },
    ],
    timeline: {
      id: 'tl1',
      projectId: 'p1',
      config: { calendarSystem: 'default' },
      events: [{ id: 'e1', date: { year: 1 }, title: '开端', description: '', type: 'battle' }],
      createdAt: 0,
      updatedAt: 0,
    },
    worldView: {
      id: 'wv1',
      projectId: 'p1',
      createdAt: 0,
      updatedAt: 0,
      magicSystem: { name: '灵力', description: 'magic desc', rules: ['一'], limitations: '无' },
    },
    plan: [{ id: 'pl1', title: '写序章', stage: 'chapter', status: 'todo', order: 0 }],
    groups: [{ id: 'g1', label: '第一卷', order: 0 }],
    extensions: {
      'storyboard.shot': [{ id: 's1', title: '分镜一', duration: 8, dialogue: '开场白', order: 0 }],
    },
  };
}

describe('跨域投影', () => {
  it('章节、清单项、规则、世界观、计划、扩展类型都成为行', () => {
    const { rows } = buildEntityView(makeProject());
    const kinds = new Set(rows.map((row) => row.kind));
    expect(kinds).toEqual(
      new Set(['chapter', 'knowledge', 'foreshadow', 'rule', 'event', 'world', 'plan', 'group', 'storyboard.shot']),
    );
  });

  it('章节正文 DSL 关键字成为行字段（分镜镜头由此进入数据源）', () => {
    const { rows } = buildEntityView(makeProject());
    const chapter = rows.find((row) => row.id === 'ch1');
    expect(chapter?.values?.['画面']).toBe('夜色中的城墙');
    expect(chapter?.values?.['景别']).toBe('远景');
    expect(chapter?.cells['台词']).toBe('你好');
    expect(chapter?.values?.wordCount).toBeTypeOf('number');
  });

  it('扩展类型条目字段按原键投影', () => {
    const { rows } = buildEntityView(makeProject());
    const shot = rows.find((row) => row.kind === 'storyboard.shot');
    expect(shot?.id).toBe('s1');
    expect(shot?.values?.duration).toBe(8);
    expect(shot?.cells.dialogue).toBe('开场白');
  });

  it('条件与公式可在任意域字段上取数', () => {
    const data = buildEntityView(makeProject());
    const filtered = applyViewQuery(data, {
      conditions: { type: 'leaf', field: 'kind', operator: 'eq', value: 'chapter' },
      computed: [
        {
          key: 'computed:doubleDuration',
          label: '双倍时长',
          expression: { kind: 'call', fn: 'multiply', args: [{ kind: 'field', key: 'wordCount' }, { kind: 'literal', value: 2 }] },
        },
      ],
    });
    expect(filtered.rows.map((row) => row.id)).toEqual(['ch1']);
    expect(filtered.rows[0]?.cells['computed:doubleDuration']).toBe(String(2 * (filtered.rows[0]?.values?.wordCount as number)));
  });

  it('字段别名把来源字段补到目标字段', () => {
    const data = buildEntityView(makeProject());
    const aliased = applyViewQuery(data, { aliases: { 画面: 'image', 景别: 'framing' } });
    const chapter = aliased.rows.find((row) => row.id === 'ch1');
    expect(chapter?.values?.image).toBe('夜色中的城墙');
    expect(chapter?.cells.framing).toBe('远景');
  });

  it('分镜预设别名让章节型分镜可被取数', () => {
    const preset = findViewPreset('preset:storyboard');
    const data = buildEntityView(makeProject());
    const projected = applyViewQuery(data, {
      aliases: preset?.layout.fieldAliases,
      conditions: { type: 'leaf', field: 'kind', operator: 'eq', value: 'chapter' },
    });
    const chapter = projected.rows.find((row) => row.id === 'ch1');
    expect(chapter?.cells.image).toBe('夜色中的城墙');
    expect(chapter?.cells.duration).toBe('4');
  });
});
