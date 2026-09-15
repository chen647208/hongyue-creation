// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * app 层视图范围查询：store 未加载当前书时按 bookId 加载一次，再取选中视图投影。
 */
import type { Character, Project } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  workId: null as string | null,
  loaded: false,
  views: [] as Array<Record<string, unknown>>,
  load: vi.fn(async (_workId: string | null) => undefined),
}));

vi.mock('@/app/stores/genericModelStore', () => ({
  useGenericModelStore: {
    getState: () => ({
      workId: store.workId,
      loaded: store.loaded,
      views: store.views,
      load: store.load,
    }),
  },
}));

import { loadViewContextScope } from '../viewContext';

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
  };
}

const view = {
  id: 'v1',
  workId: 'p1',
  name: '角色卡',
  viewType: 'entity',
  orderIndex: 0,
  config: { kind: 'card', columns: [{ key: 'title', label: 'views.col.title' }] },
};

describe('loadViewContextScope', () => {
  beforeEach(() => {
    store.views = [];
    store.loaded = false;
    store.workId = null;
    store.load.mockClear();
    window.localStorage?.clear();
  });

  it('store 未加载本书时按 bookId 加载后投影', async () => {
    store.load.mockImplementation(async (workId: string | null) => {
      store.workId = workId;
      store.loaded = true;
      store.views = [view];
    });
    const scope = await loadViewContextScope(makeProject());
    expect(store.load).toHaveBeenCalledWith('p1');
    expect(scope?.id).toBe('v1');
    expect(scope?.entityIds).toEqual(['c1', 'c2']);
  });

  it('本书无实体视图时返回 undefined，空项目返回 undefined', async () => {
    store.workId = 'p1';
    store.loaded = true;
    store.views = [{ ...view, viewType: 'other' }];
    expect(await loadViewContextScope(makeProject())).toBeUndefined();
    expect(await loadViewContextScope(null)).toBeUndefined();
    expect(store.load).not.toHaveBeenCalled();
  });
});
