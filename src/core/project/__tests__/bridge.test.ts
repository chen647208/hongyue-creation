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
import { entitiesToProject,projectToEntities } from '../bridge';

/** 覆盖全部集合与嵌套结构的富样本 */
function richProject(): Project {
  return {
    id: 'book-1',
    title: '测试之书',
    inspiration: '一个复仇故事',
    intro: '简介文本',
    outline: '三幕大纲',
    characters: [
      {
        id: 'c1', name: '林渊', gender: 'male', age: '25', role: 'protagonist',
        personality: '冷静', background: '', relationships: '与苏雪敌对',
        appearance: '', distinctiveFeatures: '', occupation: '剑客',
        motivation: '复仇', strengths: '', weaknesses: '', characterArc: '',
        factionId: 'f1', birthInfo: { calculationType: 'manual', currentAge: '25' },
      },
    ],
    chapters: [
      {
        id: 'ch1', title: '第一章', summary: '出场', content: '正文一', order: 0,
        contentSummary: '摘要', history: [
          { id: 'h1', chapterId: 'ch1', timestamp: 5, prompt: 'p', generatedContent: 'g', modelConfig: { modelName: 'm', provider: 'openai-chat' } },
        ],
        snapshots: [{ id: 's1', content: 'old', timestamp: 1, charCount: 3, source: 'manual' }],
        mainLocationId: 'l1', storyDate: { year: 3, display: '第三年' },
      },
      { id: 'ch2', title: '第二章', summary: '', content: '正文二', order: 1 },
    ],
    virtualChapters: [{ id: 'v1', title: '番外', summary: '', content: '虚拟正文', order: 0 }],
    knowledge: [{ id: 'k1', name: '设定集', content: '内容', type: 'text', size: 4, addedAt: 123, category: 'inspiration' }],
    locations: [
      { id: 'l1', projectId: 'book-1', name: '云都', type: 'city', description: '帝都', tags: ['繁华'], createdAt: 1, updatedAt: 2 },
    ],
    factions: [
      { id: 'f1', projectId: 'book-1', name: '剑阁', type: 'sect', description: '', relations: [], memberCharacterIds: ['c1'], leaderId: 'c1', createdAt: 1, updatedAt: 2 },
    ],
    ruleSystems: [
      { id: 'r1', projectId: 'book-1', type: 'cultivation', name: '修炼体系', description: '', levels: [{ name: '炼气', description: '', order: 0 }], createdAt: 1, updatedAt: 2 },
    ],
    foreshadows: [
      { id: 'fs1', title: '玉佩来历', detail: '', status: 'planted', importance: 'critical', plantedChapterId: 'ch1', plantedChapterOrder: 0, tags: [], createdAt: 1, updatedAt: 2 },
    ],
    worldView: {
      id: 'book-1:worldView', projectId: 'book-1',
      magicSystem: { name: '灵力', description: '', rules: ['守恒'], limitations: '', levels: [{ name: '一品', description: '', order: 0 }] },
      technologyLevel: { era: '蒸汽', description: '', keyTechnologies: [], limitations: '' },
      history: { overview: '大陆编年', calendarSystem: '纪元', keyEvents: [{ id: 'he1', date: { year: 1 }, title: '建国', description: '' }] },
      createdAt: 10, updatedAt: 20,
    },
    timeline: {
      id: 'tl1', projectId: 'book-1',
      config: { calendarSystem: '纪元', startYear: 100, name: '主时间线' },
      events: [
        { id: 'ev1', date: { year: 101 }, title: '开篇', description: '', type: 'plot', relatedCharacterIds: ['c1'], order: 0 },
      ],
      createdAt: 30, updatedAt: 40,
    },
    lastModified: 999,
  };
}

describe('投影桥往返（M0 硬验收）', () => {
  it('Project → 实体 → Project 深度相等', () => {
    const original = richProject();
    const entities = projectToEntities(original, 500);
    const restored = entitiesToProject(entities);
    expect(restored).toEqual(original);
  });

  it('二次投影确定性：同一 Project 两次投影哈希输入一致', () => {
    const a = projectToEntities(richProject(), 500);
    const b = projectToEntities(richProject(), 500);
    expect(a).toEqual(b);
  });

  it('空集合与缺省可选字段无损', () => {
    const minimal: Project = {
      id: 'b2', title: '空书', inspiration: '', intro: '', outline: '',
      characters: [], chapters: [], virtualChapters: [], knowledge: [], lastModified: 1,
    };
    expect(entitiesToProject(projectToEntities(minimal, 2))).toEqual(minimal);
  });

  it('章节顺序由边 position 承载（乱序数组按 order 重排）', () => {
    const p = richProject();
    p.chapters = [p.chapters[1]!, p.chapters[0]!]; // order 1, 0
    const restored = entitiesToProject(projectToEntities(p, 500));
    expect(restored.chapters.map((c) => c.id)).toEqual(['ch1', 'ch2']); // 按 order 排序
  });

  it('未知插件类型经 extensions 往返无损', () => {
    const withExt: Project = {
      ...richProject(),
      extensions: { 'example.quest': [{ id: 'q1', title: '任务一', body: '正文', order: 0 }] },
    };
    const restored = entitiesToProject(projectToEntities(withExt, 500));
    const list = restored.extensions?.['example.quest'] ?? [];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'q1', title: '任务一', body: '正文' });
  });
});

describe('读侧窄化：脏结构化数据被拒', () => {
  /** 把指定节点的指定属性值改成脏值，模拟存储里被写坏的字段。 */
  function breakAttr(entities: ReturnType<typeof projectToEntities>, nodeId: string, name: string, value: string) {
    return {
      ...entities,
      attrs: entities.attrs.map((a) => (a.nodeId === nodeId && a.name === name ? { ...a, value } : a)),
    };
  }

  it('魔法体系必填字段损坏：整个子对象丢弃，同书其它世界观分块不受影响', () => {
    const original = richProject();
    const broken = breakAttr(projectToEntities(original, 500), 'book-1:world.magic-system', 'rules', '"守恒"');
    const restored = entitiesToProject(broken);
    expect(restored.worldView?.magicSystem).toBeUndefined();
    expect(restored.worldView?.technologyLevel).toEqual(original.worldView?.technologyLevel);
    expect(restored.worldView?.history).toEqual(original.worldView?.history);
  });

  it('魔法等级列表里的脏条目只丢自己：合法等级照常读出', () => {
    const original = richProject();
    const dirty = JSON.stringify([{ name: '一品', description: '', order: 'not-a-number' }]);
    const broken = breakAttr(projectToEntities(original, 500), 'book-1:world.magic-system', 'levels', dirty);
    const restored = entitiesToProject(broken);
    expect(restored.worldView?.magicSystem?.levels).toEqual([]);
    // 必填字段未损坏，体系本体仍在
    expect(restored.worldView?.magicSystem?.name).toBe('灵力');
  });

  it('时间线事件 type 非法：该事件被丢弃，事件容器保留', () => {
    const original = richProject();
    const broken = breakAttr(projectToEntities(original, 500), 'ev1', 'type', 'not-a-type');
    const restored = entitiesToProject(broken);
    expect(restored.timeline?.events).toHaveLength(0);
    expect(restored.timeline?.config).toEqual(original.timeline?.config);
  });

  it('历史事件缺必填日期：该事件被丢弃，历史本体与其余事件保留', () => {
    const original = richProject();
    const dirty = JSON.stringify([{ id: 'he1', title: '建国', description: '' }]);
    const broken = breakAttr(projectToEntities(original, 500), 'book-1:world.history', 'keyEvents', dirty);
    const restored = entitiesToProject(broken);
    expect(restored.worldView?.history?.keyEvents).toEqual([]);
    expect(restored.worldView?.history?.overview).toBe('大陆编年');
  });
});
