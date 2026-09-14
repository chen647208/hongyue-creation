/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { Project } from '../../../shared/types';
import {
  assembleContextInjection,
  inferContextTarget,
  planContextInjection,
  renderContextInjection,
} from '../contextInjection.js';

function stubProject(content: string): Project {
  return {
    id: 'book1',
    title: '星尘之恋',
    inspiration: '',
    intro: '',
    outline: '',
    lastModified: 1,
    virtualChapters: [],
    characters: [
      {
        id: 'char1', name: '林渊', gender: 'male', age: '20', role: 'protagonist',
        personality: '沉默寡言', background: '星辉术传人', relationships: '', appearance: '',
        distinctiveFeatures: '', occupation: '', motivation: '复仇', strengths: '', weaknesses: '', characterArc: '',
      },
      {
        id: 'char2', name: '苏晚', gender: 'female', age: '19', role: 'supporting',
        personality: '活泼', background: '', relationships: '', appearance: '',
        distinctiveFeatures: '', occupation: '', motivation: '', strengths: '', weaknesses: '', characterArc: '',
      },
    ],
    locations: [
      { id: 'loc1', projectId: 'book1', name: '观星台', type: 'building', description: '城中最高处', createdAt: 1, updatedAt: 1 },
    ],
    factions: [
      { id: 'fac1', projectId: 'book1', name: '守夜人', type: 'organization', description: '维护历法' },
    ],
    chapters: [
      { id: 'ch0', title: '楔子', summary: '星辉初现', content: '楔子正文内容。', order: 0 },
      { id: 'ch1', title: '雨夜', summary: '林渊夜访观星台', content, order: 1 },
      { id: 'ch2', title: '黎明', summary: '真相揭开', content: '黎明正文。', order: 2 },
    ],
    knowledge: [
      { id: 'k1', name: '星辉术', content: '以星辰之力驱动的法术体系', type: 'rule', size: 10, addedAt: 1, category: 'writing' },
      { id: 'k2', name: '历法', content: '以星象纪年的历法', type: 'rule', size: 8, addedAt: 1, category: 'writing' },
    ],
    timeline: {
      id: 'tl1',
      projectId: 'book1',
      config: { calendarSystem: '星历' },
      events: [
        { id: 'ev1', date: { year: 1 }, title: '观星台之变', description: '守夜人内部生变', type: 'plot', relatedChapterId: 'ch1' },
        { id: 'ev2', date: { year: 2 }, title: '无关联事件', description: '', type: 'other' },
      ],
      createdAt: 1,
      updatedAt: 1,
    },
  } as unknown as Project;
}

describe('planContextInjection（按场景选片）', () => {
  it('当前章节注入正文片段、细纲与前情，并标注来源与触发', () => {
    const entries = planContextInjection(stubProject('雨夜' + '风'.repeat(200)), { chapterId: 'ch1' });
    const body = entries.find((e) => e.id === 'chapter:ch1:body');
    const summary = entries.find((e) => e.id === 'chapter:ch1:summary');
    const recap = entries.find((e) => e.id === 'chapter:ch0:recap');

    expect(body?.quote).toBe(true);
    expect(body?.original).toContain('雨夜');
    expect(body?.source).toMatchObject({ kind: 'chapter', refId: 'ch1' });
    expect(body?.trigger).toBe('当前章节');
    expect(summary?.text).toContain('林渊夜访观星台');
    expect(recap?.source.refId).toBe('ch0');
    expect(recap?.trigger).toBe('前情');
  });

  it('选中实体注入该实体，标注类型与 id', () => {
    const entries = planContextInjection(stubProject(''), { entityId: 'char1', entityKind: 'character' });
    const selected = entries.find((e) => e.id === 'character:char1');
    expect(selected?.source).toMatchObject({ kind: 'character', refId: 'char1', title: '林渊' });
    expect(selected?.text).toContain('沉默寡言');
  });

  it('关键词命中知识库/角色/地点/势力与时间线事件', () => {
    const entries = planContextInjection(stubProject(''), { query: '林渊用星辉术在观星台' });
    const ids = entries.map((e) => e.id);
    expect(ids).toContain('knowledge:k1');
    expect(ids).toContain('character:char1');
    expect(ids).toContain('location:loc1');
  });

  it('时间线事件按当前章节关联注入', () => {
    const entries = planContextInjection(stubProject(''), { chapterId: 'ch1' });
    const event = entries.find((e) => e.id === 'timeline:ev1');
    expect(event?.trigger).toBe('当前章节关联事件');
  });
});

describe('inferContextTarget', () => {
  it('从「第N章」推断章节，从实体名推断实体', () => {
    const project = stubProject('');
    expect(inferContextTarget(project, '把第2章重写一下').chapterId).toBe('ch1');
    expect(inferContextTarget(project, '林渊接下来会做什么').entityId).toBe('char1');
    expect(inferContextTarget(project, '苏晚的动机').entityKind).toBe('character');
    expect(inferContextTarget(null, '第2章').chapterId).toBeUndefined();
  });
});

describe('assembleContextInjection（预算裁剪与逐字校验）', () => {
  const body = '雨' + '风'.repeat(300);

  it('按优先级保留高优条目，超预算的被裁并记录', () => {
    const result = assembleContextInjection({
      project: stubProject(body),
      target: { chapterId: 'ch1' },
      budgetChars: 180,
    });
    expect(result.entries[0]?.id).toBe('chapter:ch1:body');
    expect(result.totalChars).toBeLessThanOrEqual(180);
    expect(result.droppedByBudget.length).toBeGreaterThan(0);
    expect(result.truncated).toBe(true);
  });

  it('引用型片段与原文不一致时剔除并标出', () => {
    const result = assembleContextInjection({
      project: stubProject(''),
      extraEntries: [{
        id: 'quote:bad',
        title: '伪造引用',
        text: '原文里没有的一句话',
        source: { kind: 'chapter', refId: 'ch1', title: '雨夜' },
        trigger: '引用',
        priority: 99,
        scope: 'book',
        quote: true,
        original: '真正的原文内容',
      }],
    });
    expect(result.entries).toHaveLength(0);
    expect(result.dropped).toEqual([{ id: 'quote:bad', title: '伪造引用', reason: 'quote-mismatch' }]);
  });

  it('单条关闭的条目不注入并记录', () => {
    const result = assembleContextInjection({
      project: stubProject('雨夜的风吹过观星台。'),
      target: { chapterId: 'ch1' },
      disabledIds: ['chapter:ch1:body'],
    });
    expect(result.entries.some((e) => e.id === 'chapter:ch1:body')).toBe(false);
    expect(result.dropped.some((d) => d.id === 'chapter:ch1:body' && d.reason === 'disabled')).toBe(true);
  });

  it('关闭注入时不做任何装配', () => {
    const result = assembleContextInjection({
      project: stubProject(body),
      target: { chapterId: 'ch1' },
      enabled: false,
    });
    expect(result.enabled).toBe(false);
    expect(result.entries).toEqual([]);
    expect(result.dropped).toEqual([]);
  });
});

describe('renderContextInjection', () => {
  it('逐条渲染来源与触发，并列出被裁条目', () => {
    const result = assembleContextInjection({
      project: stubProject('正文' + '字'.repeat(300)),
      target: { chapterId: 'ch1' },
      budgetChars: 120,
    });
    const text = renderContextInjection(result);
    expect(text).toContain('来源：章节《雨夜》');
    expect(text).toContain('被裁条目');
    expect(renderContextInjection({ ...result, entries: [], dropped: [] })).toBeUndefined();
  });
});
