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

import { buildEntityView } from '../buildEntityView';
import { DEFAULT_VIEW_LAYOUT, parseViewLayout, serializeViewLayout } from '../viewLayout';

function makeCharacter(overrides: Partial<Character> & Pick<Character, 'id' | 'name'>): Character {
  return {
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
    ...overrides,
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
    characters: [
      makeCharacter({ id: 'c1', name: '主角', occupation: '剑士', factionId: 'f1', currentLocationId: 'l1' }),
      makeCharacter({ id: 'c2', name: '游侠' }),
    ],
    locations: [
      { id: 'l1', projectId: 'p1', name: '港城', type: 'city', description: '', controlledBy: 'f1', createdAt: 0, updatedAt: 0 },
    ],
    factions: [
      { id: 'f1', projectId: 'p1', name: '白鸦团', type: 'guild', description: '', leaderId: 'c1', memberCharacterIds: ['c1'], createdAt: 0, updatedAt: 0 },
    ],
    timeline: {
      id: 'tl1',
      projectId: 'p1',
      config: { calendarSystem: 'default' },
      events: [
        { id: 'e1', date: { year: 100, month: 3 }, title: '港城之战', description: '', type: 'battle', relatedCharacterIds: ['c1'], relatedLocationIds: ['l1'] },
      ],
      createdAt: 0,
      updatedAt: 0,
    },
  };
}

describe('buildEntityView', () => {
  it('把角色/地点/势力/事件拍平为行', () => {
    const { rows } = buildEntityView(makeProject());
    expect(rows.map((row) => row.id)).toEqual(['c1', 'c2', 'l1', 'f1', 'e1']);
    const character = rows.find((row) => row.id === 'c1');
    expect(character?.kind).toBe('character');
    expect(character?.cells.detail).toBe('港城');
    const event = rows.find((row) => row.id === 'e1');
    expect(event?.cells.summary).toBe('100-3');
  });

  it('只保留两端都存在的关系边', () => {
    const project = makeProject();
    project.characters.push(makeCharacter({ id: 'c9', name: '孤儿', factionId: 'missing' }));
    const { links } = buildEntityView(project);
    expect(links.every((link) => link.target !== 'missing')).toBe(true);
    expect(links).toEqual(
      expect.arrayContaining([
        { source: 'c1', target: 'f1', label: 'belongs' },
        { source: 'c1', target: 'l1', label: 'located' },
        { source: 'c1', target: 'f1', label: 'leads' },
        { source: 'e1', target: 'c1', label: 'involves' },
      ]),
    );
  });
});

describe('viewLayout 编解码', () => {
  it('缺省回退到默认布局', () => {
    expect(parseViewLayout(undefined)).toEqual(DEFAULT_VIEW_LAYOUT);
    expect(parseViewLayout({ kind: 'nope' }).kind).toBe(DEFAULT_VIEW_LAYOUT.kind);
  });

  it('往返保持字段', () => {
    const layout = { ...DEFAULT_VIEW_LAYOUT, kind: 'table' as const, hidden: ['detail'], sortKey: 'kind', sortDesc: true, height: 560 };
    const restored = parseViewLayout(serializeViewLayout(layout));
    expect(restored.kind).toBe('table');
    expect(restored.hidden).toEqual(['detail']);
    expect(restored.sortKey).toBe('kind');
    expect(restored.sortDesc).toBe(true);
    expect(restored.height).toBe(560);
  });
});
