/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Chapter, Character, Faction, Location, Project } from '@shared/types';
import { beforeEach,describe, expect, it, vi } from 'vitest';

const { performSemanticCheck, loggerError } = vi.hoisted(() => ({
  performSemanticCheck: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/i18n', () => ({ i18n: { t: (key: string) => key } }));
vi.mock('../../utils/logger', () => ({ logger: { error: loggerError, warn: vi.fn(), info: vi.fn() } }));
vi.mock('../aiSemanticCheckService', () => ({ performSemanticCheck }));

import {
  checkWorldConsistency,
  fixDanglingReferences,
  performAdvancedConsistencyCheck,
  quickCheck,
} from '../worldConsistencyService';

const char = (over: Partial<Character> = {}): Character =>
  ({ id: 'c1', name: '林远', age: '20', background: '出身寒门', ...over }) as unknown as Character;

const faction = (over: Partial<Faction> = {}): Faction =>
  ({ id: 'f1', name: '青云宗', type: 'sect', projectId: 'p', description: '', ...over }) as unknown as Faction;

const chapter = (over: Partial<Chapter> = {}): Chapter =>
  ({ id: 'ch1', title: '第一章', summary: '', content: '', order: 1, ...over }) as unknown as Chapter;

const location = (id: string): Location => ({ id, name: id }) as unknown as Location;

const project = (over: Partial<Project> = {}): Project =>
  ({ id: 'p', title: '书', chapters: [], characters: [], ...over }) as unknown as Project;

const ids = (issues: Array<{ id: string }>): string[] => issues.map((i) => i.id);

describe('悬空引用检查', () => {
  const p = project({
    locations: [location('l-ok')],
    characters: [
      char({ id: 'c-good', factionId: 'f1', homeLocationId: 'l-ok', currentLocationId: 'l-ok' }),
      char({
        id: 'c-bad',
        name: '苏晴',
        factionId: 'f-missing',
        homeLocationId: 'l-missing',
        currentLocationId: 'l-missing-2',
      }),
    ],
    factions: [
      faction({ id: 'f1', headquartersLocationId: 'l-ok', territoryLocationIds: ['l-ok'] }),
      faction({
        id: 'f-bad',
        name: '黑风寨',
        headquartersLocationId: 'l-missing',
        territoryLocationIds: ['l-ok', 'l-missing-territory'],
        leaderId: 'c-missing',
      }),
    ],
    chapters: [
      chapter({
        id: 'ch-bad',
        mainLocationId: 'l-missing',
        involvedFactionIds: ['f1', 'f-missing'],
        timelineEventId: 'e-missing',
      }),
    ],
    timeline: { events: [{ id: 'e1', title: '开端' }] } as unknown as Project['timeline'],
  });

  it('只报悬空引用，合法引用不报', async () => {
    const r = await checkWorldConsistency(p, undefined, {
      checkDanglingReferences: true,
      checkTimelineConflicts: false,
      checkCharacterConsistency: false,
      checkFactionLogic: false,
    });
    expect(ids(r.issues)).toEqual([
      'char-c-bad-faction',
      'char-c-bad-home',
      'char-c-bad-current',
      'faction-f-bad-hq',
      'faction-f-bad-territory-l-missing-territory',
      'faction-f-bad-leader',
      'chapter-ch-bad-location',
      'chapter-ch-bad-faction-f-missing',
      'chapter-ch-bad-event',
    ]);
    expect(r.summary).toEqual({ total: 9, errors: 2, warnings: 7, infos: 0 });
  });

  it('缺少可选集合时不报错', () => {
    const r = quickCheck({ id: 'p' } as unknown as Project);
    expect(r.summary.total).toBe(0);
  });
});

describe('时间线冲突检查', () => {
  it('同名事件不同 id 报 warning', () => {
    const p = project({
      timeline: {
        events: [
          { id: 'e1', title: '大战' },
          { id: 'e2', title: '大战' },
          { id: 'e3', title: '和平' },
        ],
      } as unknown as Project['timeline'],
    });
    const r = quickCheck(p);
    expect(ids(r.issues)).toEqual(['timeline-conflict-e1-e2']);
    expect(r.issues[0]?.type).toBe('warning');
  });

  it('没有事件集合时不报错', () => {
    expect(quickCheck(project({ timeline: {} as Project['timeline'] })).summary.total).toBe(0);
  });
});

describe('角色一致性检查', () => {
  it('重名报 info，年龄越界报 warning，非数字年龄忽略', () => {
    const r = quickCheck(
      project({
        characters: [
          char({ id: 'c1', name: '同名' }),
          char({ id: 'c2', name: '同名' }),
          char({ id: 'c3', name: '老者', age: '300' }),
          char({ id: 'c4', name: '神秘人', age: '不详' }),
          char({ id: 'c5', name: '负龄', age: '-5' }),
        ],
      }),
    );
    expect(ids(r.issues).sort()).toEqual(['char-c3-age-invalid', 'char-c5-age-invalid', 'duplicate-name-同名']);
    expect(r.summary.infos).toBe(1);
    expect(r.summary.warnings).toBe(2);
  });
});

describe('势力逻辑检查', () => {
  it('无成员报 info，other 类型不报', () => {
    const r = quickCheck(
      project({
        factions: [faction({ id: 'f1' }), faction({ id: 'f2', name: '散修', type: 'other' })],
        characters: [],
      }),
    );
    expect(ids(r.issues)).toEqual(['faction-f1-members']);
    expect(r.issues[0]?.type).toBe('info');
  });

  it('领袖不属于本势力报 warning', () => {
    const r = quickCheck(
      project({
        factions: [faction({ id: 'f1', leaderId: 'c1' }), faction({ id: 'f2', name: '敌方', leaderId: 'c2' })],
        characters: [
          char({ id: 'c1', name: '甲', factionId: 'f1' }),
          char({ id: 'c2', name: '乙', factionId: 'f1' }),
          char({ id: 'c3', name: '丙', factionId: 'f2' }),
        ],
      }),
    );
    expect(ids(r.issues)).toEqual(['faction-f2-leader-member']);
    expect(r.issues[0]?.type).toBe('warning');
  });
});

describe('checkWorldConsistency', () => {
  it('按选项裁剪检查项并统计各类型数量', async () => {
    const r = await checkWorldConsistency(
      project({
        characters: [char({ id: 'c1', name: '同名' }), char({ id: 'c2', name: '同名' })],
        factions: [faction({ id: 'f1' })],
        timeline: { events: [{ id: 'e1', title: '同名' }, { id: 'e2', title: '同名' }] } as unknown as Project['timeline'],
      }),
      undefined,
      { checkCharacterConsistency: true, checkTimelineConflicts: true },
    );
    expect(r.summary).toEqual({ total: 2, errors: 0, warnings: 1, infos: 1 });
    expect(typeof r.checkedAt).toBe('number');
  });

  it('同一 id 的问题只保留一条', async () => {
    const r = await checkWorldConsistency(
      project({
        factions: [faction({ id: 'f1', leaderId: 'c-missing' })],
        characters: [],
      }),
      undefined,
      { checkDanglingReferences: true },
    );
    expect(ids(r.issues)).toEqual(['faction-f1-leader']);
  });
});

describe('fixDanglingReferences', () => {
  it('清掉失效引用，保留有效引用', () => {
    const fixed = fixDanglingReferences(
      project({
        locations: [location('l-ok')],
        characters: [
          char({ id: 'c1', factionId: 'f-missing', homeLocationId: 'missing', currentLocationId: 'l-ok' }),
        ],
        factions: [
          faction({
            id: 'f1',
            headquartersLocationId: 'missing',
            territoryLocationIds: ['l-ok', 'missing'],
            leaderId: 'c1',
          }),
        ],
        chapters: [
          chapter({
            id: 'ch1',
            mainLocationId: 'missing',
            involvedFactionIds: ['f1', 'missing'],
            timelineEventId: 'missing',
          }),
        ],
      }),
    );
    expect(fixed.characters[0]?.factionId).toBeUndefined();
    expect(fixed.characters[0]?.homeLocationId).toBeUndefined();
    expect(fixed.characters[0]?.currentLocationId).toBe('l-ok');
    expect(fixed.factions?.[0]?.headquartersLocationId).toBeUndefined();
    expect(fixed.factions?.[0]?.territoryLocationIds).toEqual(['l-ok']);
    expect(fixed.factions?.[0]?.leaderId).toBe('c1');
    expect(fixed.chapters[0]?.mainLocationId).toBeUndefined();
    expect(fixed.chapters[0]?.involvedFactionIds).toEqual(['f1']);
    expect(fixed.chapters[0]?.timelineEventId).toBeUndefined();
  });

  it('领袖不存在时清掉', () => {
    const fixed = fixDanglingReferences(
      project({ factions: [faction({ id: 'f1', leaderId: 'c-missing' })], characters: [] }),
    );
    expect(fixed.factions?.[0]?.leaderId).toBeUndefined();
  });
});

describe('performAdvancedConsistencyCheck', () => {
  beforeEach(() => {
    performSemanticCheck.mockReset();
    loggerError.mockReset();
  });

  const baseProject = project({
    factions: [faction({ id: 'f1', type: 'sect' })],
    characters: [],
  });

  it('rule 模式不调用 AI', async () => {
    const r = await performAdvancedConsistencyCheck(baseProject, { mode: 'rule' });
    expect(performSemanticCheck).not.toHaveBeenCalled();
    expect(r.summary.total).toBe(1);
  });

  it('ai 模式缺模型时不调用 AI', async () => {
    await performAdvancedConsistencyCheck(baseProject, { mode: 'ai' });
    expect(performSemanticCheck).not.toHaveBeenCalled();
  });

  it('hybrid 模式合并 AI 问题并按置信度定级', async () => {
    performSemanticCheck.mockResolvedValue({
      issues: [
        {
          id: 'sem-1',
          category: 'character',
          targetIds: ['c1'],
          targetNames: ['林远'],
          message: '性格前后矛盾',
          suggestion: '补充动机',
          confidence: 0.9,
          evidence: ['第一章', '第三章'],
        },
        {
          id: 'sem-2',
          category: 'cross_category',
          targetIds: [],
          targetNames: [],
          message: '设定冲突',
          confidence: 0.6,
          evidence: [],
        },
        {
          id: 'sem-3',
          category: 'faction',
          targetIds: ['f1'],
          targetNames: ['青云宗'],
          message: '势力关系模糊',
          confidence: 0.3,
          evidence: [],
        },
      ],
    });
    const onProgress = vi.fn();
    const r = await performAdvancedConsistencyCheck(baseProject, {
      mode: 'hybrid',
      model: { id: 'm' } as never,
      templates: {},
      onProgress,
    });
    expect(performSemanticCheck).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(0, 100, 'world:rules.progressStarting');
    const byId = new Map(r.issues.map((i) => [i.id, i]));
    expect(byId.get('sem-1')?.type).toBe('error');
    expect(byId.get('sem-1')?.targetName).toBe('林远');
    expect(byId.get('sem-1')?.details).toBe('world:rules.detailsConfidence');
    expect(byId.get('sem-2')?.type).toBe('warning');
    expect(byId.get('sem-2')?.category).toBe('rule');
    expect(byId.get('sem-2')?.targetId).toBe('unknown');
    expect(byId.get('sem-2')?.targetName).toBe('world:rules.targetUnknown');
    expect(byId.get('sem-3')?.type).toBe('info');
    expect(r.summary).toEqual({ total: 4, errors: 1, warnings: 1, infos: 2 });
  });

  it('AI 检查抛错时记录日志并返回规则结果', async () => {
    performSemanticCheck.mockRejectedValue(new Error('网络错误'));
    const r = await performAdvancedConsistencyCheck(baseProject, {
      mode: 'ai',
      model: { id: 'm' } as never,
      templates: {},
    });
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(r.summary.total).toBe(1);
  });
});
