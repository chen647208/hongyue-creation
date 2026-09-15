/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Character, Project } from '@shared/types';
import { describe, expect, it } from 'vitest';

import type { ViewDefinition } from '@/app/stores/genericModelStore';

import { buildViewContextScope } from '../viewContext';

function character(id: string, name: string): Character {
  return {
    id,
    name,
    gender: 'unknown',
    age: '',
    role: 'supporting',
    personality: '',
    background: '',
    relationships: '',
    appearance: '',
    distinctiveFeatures: '',
    occupation: '',
    motivation: '',
    strengths: '',
    weaknesses: '',
    characterArc: '',
  };
}

function makeProject(): Project {
  return {
    id: 'p1',
    title: 'T',
    inspiration: '',
    intro: '',
    outline: '',
    chapters: [],
    virtualChapters: [],
    knowledge: [],
    lastModified: 0,
    characters: [character('c1', '主角'), character('c2', '游侠')],
    locations: [{ id: 'l1', projectId: 'p1', name: '港城', type: 'city', description: '', createdAt: 0, updatedAt: 0 }],
  };
}

function characterView(kindFilter?: string): ViewDefinition {
  return {
    id: 'v1',
    workId: 'p1',
    name: '角色卡',
    viewType: 'entity',
    orderIndex: 0,
    config: {
      kind: 'card',
      kindFilter,
      columns: [{ key: 'title', label: 'views.col.title' }],
      conditions: { type: 'and', children: [{ type: 'leaf', field: 'kind', operator: 'eq', value: 'character' }] },
    },
  };
}

describe('buildViewContextScope（按视图条件投影范围）', () => {
  it('按条件过滤可见实体并给出条件摘要与列', () => {
    const scope = buildViewContextScope(makeProject(), characterView());
    expect(scope.entityIds).toEqual(['c1', 'c2']);
    expect(scope.conditionSummary).toBe('kind = character');
    expect(scope.columns).toContain('title');
    expect(scope.kindFilter).toBeUndefined();
  });

  it('kindFilter 为 all 时不作为筛选条件暴露', () => {
    const scope = buildViewContextScope(makeProject(), characterView('all'));
    expect(scope.kindFilter).toBeUndefined();
    expect(scope.entityIds).toEqual(['c1', 'c2']);
  });

  it('kindFilter 限定实体类型时只保留对应行', () => {
    const scope = buildViewContextScope(makeProject(), characterView('character'));
    expect(scope.kindFilter).toBe('character');
    expect(scope.entityIds).toEqual(['c1', 'c2']);
  });
});
