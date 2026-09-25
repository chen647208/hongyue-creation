/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';

vi.mock('@core/ai', () => ({
  renderWorldDigest: vi.fn(() => '世界观数据摘要'),
}));

vi.mock('@/shared/services/ai/aiService', () => ({
  AIService: { call: vi.fn() },
}));

import type { Project } from '../../../../../shared/types';
import {
  getAIEnhancedRecommendations,
  getDisplayName,
  getRecommendationsForCardCommand,
  getSceneRecommendations,
  getSmartRecommendations,
} from '../smartRecommendationService';

// 极简项目夹具：只带推荐逻辑用到的字段，类型断言放宽避免整棵实体树。
function makeProject(): Project {
  return {
    id: 'p1',
    characters: [
      { id: 'c1', name: '阿星', role: 'protagonist', background: '勇敢的少年' },
      { id: 'c2', name: '老王', role: 'mentor', factionId: 'f1', currentLocationId: 'l1' },
    ],
    factions: [
      { id: 'f1', name: '星辉会', leaderId: 'c1', headquartersLocationId: 'l1' },
    ],
    locations: [
      { id: 'l1', name: '观星塔', locationType: 'tower' },
      { id: 'l2', name: '荒原', locationType: 'wasteland' },
    ],
    timeline: {
      events: [
        { id: 'e1', title: '流星坠落', date: '1001', relatedCharacterIds: ['c1'] },
      ],
    },
    ruleSystems: [
      { id: 'r1', name: '星辉术', levels: ['入门', '大成'] },
    ],
  } as unknown as Project;
}

describe('getDisplayName', () => {
  it('优先取 name，时间线事件取 title，无名字返回空串', () => {
    expect(getDisplayName({ id: 'x', name: '阿星' } as never)).toBe('阿星');
    expect(getDisplayName({ id: 'x', title: '流星坠落' } as never)).toBe('流星坠落');
    expect(getDisplayName({ id: 'x' } as never)).toBe('');
  });
});

describe('getSmartRecommendations（关键词与关联评分）', () => {
  it('正文包含名称时命中关键词：得 10 分且理由为通用描述', () => {
    const result = getSmartRecommendations(makeProject(), { currentContent: '阿星抬头看向观星塔' }, { minScore: 1 });
    const byId = new Map(result.recommendations.map(r => [r.id, r]));
    expect(byId.get('c1')?.relevanceScore).toBe(10);
    expect(byId.get('l1')?.relevanceScore).toBe(10);
    // 分数 10 不满足 >10，理由落到「可能相关」档
    expect(byId.get('c1')?.reason).toBe(i18n.t('assistant:rec.reason.maybeRelevant'));
  });

  it('低于 minScore 的候选被过滤，空正文且无关联时返回空列表', () => {
    const result = getSmartRecommendations(makeProject(), {}, { minScore: 1 });
    expect(result.recommendations).toEqual([]);
  });

  it('按分数降序排序，且 maxResults 截断', () => {
    const project = makeProject();
    // c2 关键词 10 + 势力成员 15 = 25；c1 领袖 20；其余更低
    const result = getSmartRecommendations(
      project,
      { currentContent: '老王在荒原', selectedFaction: 'f1' },
      { maxResults: 2, minScore: 0 }
    );
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0]!.id).toBe('c2');
    expect(result.recommendations[0]!.relevanceScore).toBe(25);
    expect(result.recommendations[0]!.relevanceScore).toBeGreaterThanOrEqual(
      result.recommendations[1]!.relevanceScore
    );
  });

  it('categories 只收集指定类别的候选', () => {
    const result = getSmartRecommendations(makeProject(), { currentContent: '观星塔' }, { categories: ['location'] });
    expect(result.recommendations.map(r => r.type)).toEqual(['location']);
  });

  it('关联评分：选中角色命中势力领袖(+20)与成员(+15)，地点总部(+12)', () => {
    const result = getSmartRecommendations(
      makeProject(),
      { selectedFaction: 'f1' },
      { minScore: 0, categories: ['character', 'faction', 'location'] }
    );
    const byId = new Map(result.recommendations.map(r => [r.id, r]));
    expect(byId.get('c1')?.relevanceScore).toBe(20); // 领袖
    expect(byId.get('c2')?.relevanceScore).toBe(15); // 成员
    expect(byId.get('l1')?.relevanceScore).toBe(12); // 总部
    expect(byId.get('c1')?.reason).toBe(i18n.t('assistant:rec.reason.factionLeader', { name: '星辉会' }));
    expect(byId.get('c1')?.suggestedAction).toBe('mention');
  });

  it('关联评分：选中角色时，其所在地点(+12)与所属势力(+15)加分，事件按 relatedCharacterIds(+10)', () => {
    const result = getSmartRecommendations(
      makeProject(),
      { selectedCharacters: ['c2'] },
      { minScore: 0, maxResults: 10, categories: ['character', 'faction', 'location', 'event'] }
    );
    const byId = new Map(result.recommendations.map(r => [r.id, r]));
    expect(byId.get('f1')?.relevanceScore).toBe(15); // c2.factionId
    expect(byId.get('l1')?.relevanceScore).toBe(12); // c2.currentLocationId
    expect(byId.get('e1')?.relevanceScore).toBe(0); // e1 只关联 c1，不关联 c2
  });

  it('事件关联：relatedCharacterIds 包含选中角色才加分', () => {
    const result = getSmartRecommendations(
      makeProject(),
      { selectedCharacters: ['c1'] },
      { minScore: 0, categories: ['event'] }
    );
    expect(result.recommendations.find(r => r.id === 'e1')?.relevanceScore).toBe(10);
  });

  it('生成理由：选中角色所在地点用 currentLocation 文案；建议动作为引用（单角色+角色项）', () => {
    const result = getSmartRecommendations(
      makeProject(),
      { selectedCharacters: ['c2'] },
      { minScore: 0, categories: ['location', 'character'] }
    );
    const byId = new Map(result.recommendations.map(r => [r.id, r]));
    expect(byId.get('l1')?.reason).toBe(i18n.t('assistant:rec.reason.currentLocation', { name: '老王' }));
    expect(byId.get('c1')?.suggestedAction).toBe('reference'); // 单选角色 + 角色项
  });

  it('选中地点时，角色在该地加分(+12)且建议动作 link；势力总部命中 hqAt 文案', () => {
    const result = getSmartRecommendations(
      makeProject(),
      { selectedLocation: 'l1' },
      { minScore: 0, categories: ['character', 'faction', 'location'] }
    );
    const byId = new Map(result.recommendations.map(r => [r.id, r]));
    expect(byId.get('c2')?.relevanceScore).toBe(12);
    expect(byId.get('c2')?.suggestedAction).toBe('mention');
    expect(byId.get('f1')?.reason).toBe(i18n.t('assistant:rec.reason.hqAt', { name: '观星塔' }));
    expect(byId.get('l1')?.suggestedAction).toBe('link');
  });

  it('上下文描述：有人物/地点/场景时拼接，空上下文回退全局文案', () => {
    const withCtx = getSmartRecommendations(
      makeProject(),
      { selectedCharacters: ['c1'], selectedLocation: 'l1', writingScene: 'dialogue' },
      { minScore: 0 }
    );
    expect(withCtx.context).toBe(
      [i18n.t('assistant:rec.ctx.characters', { names: '阿星' }), i18n.t('assistant:rec.ctx.location', { name: '观星塔' }), i18n.t('assistant:rec.ctx.scene', { scene: 'dialogue' })].join(' | ')
    );
    const empty = getSmartRecommendations(makeProject(), {}, { minScore: 0 });
    expect(empty.context).toBe(i18n.t('assistant:rec.ctx.global'));
    expect(typeof empty.generatedAt).toBe('number');
  });
});

describe('getRecommendationsForCardCommand', () => {
  it('按命令映射类别：/角色 卡推荐势力与地点，minScore=0 全量返回', () => {
    const result = getRecommendationsForCardCommand(makeProject(), 'character', '这是一个角色描述');
    const types = new Set(result.recommendations.map(r => r.type));
    expect(types.has('character')).toBe(false);
    expect(types.has('faction')).toBe(true);
    expect(types.has('location')).toBe(true);
    // 关键词命中：描述里含名称
    const hit = getRecommendationsForCardCommand(makeProject(), 'character', '星辉会的据点');
    expect(hit.recommendations.find(r => r.id === 'f1')?.relevanceScore).toBeGreaterThan(0);
  });

  it('未知命令回退到角色/势力/地点三类', () => {
    const result = getRecommendationsForCardCommand(makeProject(), 'unknown' as never, '');
    const types = new Set(result.recommendations.map(r => r.type));
    expect(types).toEqual(new Set(['character', 'faction', 'location']));
  });
});

describe('getSceneRecommendations', () => {
  it('对话场景推荐角色与势力，并携带地点与角色上下文', () => {
    const result = getSceneRecommendations(makeProject(), 'dialogue', 'l1', ['c2']);
    const types = new Set(result.recommendations.map(r => r.type));
    expect(types).toEqual(new Set(['character', 'faction']));
    expect(result.context).toContain('观星塔');
  });

  it('转场场景收集地点与事件类别：事件按角色关联加分，无命中地点被 minScore 过滤', () => {
    const result = getSceneRecommendations(makeProject(), 'transition', 'l1', ['c1']);
    const byId = new Map(result.recommendations.map(r => [r.id, r]));
    expect(byId.get('e1')?.relevanceScore).toBe(10); // relatedCharacterIds 含 c1
    expect(byId.get('l1')).toBeUndefined(); // 地点无关键词无关联，0 分被过滤
  });
});

describe('getAIEnhancedRecommendations', () => {
  it('AI 选中的推荐加分 20 并追加 AI 理由，重排后截断到 maxResults', async () => {
    const { AIService } = await import('@/shared/services/ai/aiService');
    vi.mocked(AIService.call).mockResolvedValue({
      content: '{"topPicks":[{"name":"老王","reason":"契合当前对话"}]}',
    } as never);

    const project = makeProject();
    const result = await getAIEnhancedRecommendations(
      project,
      { currentContent: '老王', selectedCharacters: ['c2'] },
      { id: 'm1' } as never,
      { maxResults: 2 }
    );

    // 老王 原分：关键词 10（AI 加分 20 后为 30），关联关联加在势力/地点上，应排第一
    expect(result.recommendations[0]!.id).toBe('c2');
    expect(result.recommendations[0]!.relevanceScore).toBe(30);
    expect(result.recommendations[0]!.reason).toContain('(AI: 契合当前对话)');
    expect(result.recommendations).toHaveLength(2);
    expect(AIService.call).toHaveBeenCalledTimes(1);
  });

  it('AI 返回无 JSON 时回退基础推荐', async () => {
    const { AIService } = await import('@/shared/services/ai/aiService');
    vi.mocked(AIService.call).mockResolvedValue({ content: '无法解析' } as never);

    const result = await getAIEnhancedRecommendations(makeProject(), { currentContent: '老王' }, { id: 'm1' } as never);
    expect(result.recommendations.find(r => r.id === 'c2')?.relevanceScore).toBe(10);
    expect(result.recommendations[0]!.reason).not.toContain('(AI:');
  });

  it('AI 调用抛错时回退基础推荐，不向上抛出', async () => {
    const { AIService } = await import('@/shared/services/ai/aiService');
    vi.mocked(AIService.call).mockRejectedValue(new Error('网络故障'));

    const result = await getAIEnhancedRecommendations(makeProject(), { currentContent: '老王' }, { id: 'm1' } as never);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0]!.reason).not.toContain('(AI:');
  });
});
