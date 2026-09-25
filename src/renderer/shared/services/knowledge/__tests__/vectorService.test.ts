/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYWORD_WEIGHT, DEFAULT_SEMANTIC_WEIGHT } from '../../../../../shared/constants/chapters';
import type { VectorDocument } from '../../../../../shared/types';

vi.mock('../../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// 被测模块在导入时会构造单例（构造函数读取 window），node 环境无 window，须在导入前打桩。
vi.hoisted(() => {
  vi.stubGlobal('window', {});
});

import { VectorService } from '../vectorService';

const doc = (id: string, embedding: number[], over: Partial<VectorDocument> = {}): VectorDocument => ({
  id,
  projectId: 'p1',
  knowledgeItemId: `ki-${id}`,
  content: `content of ${id}`,
  embedding,
  metadata: { category: 'character', type: 'note', size: 10, addedAt: 1 },
  ...over,
});

const embed384 = (): number[] => new Array<number>(384).fill(0.1);

describe('VectorService（浏览器内存模式）', () => {
  let svc: VectorService;

  beforeEach(() => {
    vi.stubGlobal('window', {});
    svc = new VectorService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('未显式 initialize 时首个操作自动完成初始化', async () => {
    const ids = await svc.addDocuments('p1', [doc('d1', [1, 0])]);
    expect(ids).toEqual(['d1']);
  });

  it('addDocuments 存入文档并返回 id 列表', async () => {
    const ids = await svc.addDocuments('p1', [doc('d1', [1, 0]), doc('d2', [0, 1], { metadata: { category: 'outline', type: 'note', size: 5, addedAt: 2 } })]);
    expect(ids).toEqual(['d1', 'd2']);
    const stats = await svc.getCollectionStats('p1');
    expect(stats.count).toBe(2);
  });

  it('updateDocument 覆盖原内容并可被语义搜索命中新内容', async () => {
    await svc.addDocuments('p1', [doc('d1', [1, 0])]);
    const updated = doc('d1', [1, 0], { content: 'updated content' });
    await expect(svc.updateDocument('p1', updated)).resolves.toBe(true);
    const results = await svc.semanticSearch('p1', [1, 0]);
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe('updated content');
  });

  it('deleteDocuments 删除指定文档', async () => {
    await svc.addDocuments('p1', [doc('d1', [1, 0]), doc('d2', [0, 1])]);
    await expect(svc.deleteDocuments('p1', ['d1'])).resolves.toBe(true);
    const stats = await svc.getCollectionStats('p1');
    expect(stats.count).toBe(1);
  });

  describe('semanticSearch 余弦相似度', () => {
    beforeEach(async () => {
      await svc.addDocuments('p1', [
        doc('same', [1, 0]),
        doc('ortho', [0, 1]),
        doc('diagonal', [Math.SQRT1_2, Math.SQRT1_2]),
      ]);
    });

    it('同向 = 1、对角 = √2/2、正交 = 0，按分数降序', async () => {
      const results = await svc.semanticSearch('p1', [1, 0]);
      expect(results.map(r => r.document.id)).toEqual(['same', 'diagonal', 'ortho']);
      expect(results[0]?.score).toBeCloseTo(1, 9);
      expect(results[1]?.score).toBeCloseTo(Math.SQRT1_2, 9);
      expect(results[2]?.score).toBeCloseTo(0, 9);
    });

    it('反向 = -1（需显式放低 threshold 才不被过滤）', async () => {
      const results = await svc.semanticSearch('p1', [-1, 0], { threshold: -2 });
      const byId = new Map(results.map(r => [r.document.id, r.score]));
      expect(byId.get('same')).toBeCloseTo(-1, 9);
      expect(byId.get('ortho')).toBeCloseTo(0, 9);
      expect(byId.get('diagonal')).toBeCloseTo(-Math.SQRT1_2, 9);
      // 分数降序：0 > -√2/2 > -1
      expect(results.map(r => r.document.id)).toEqual(['ortho', 'diagonal', 'same']);
    });

    it('threshold 过滤低于阈值的结果', async () => {
      const results = await svc.semanticSearch('p1', [1, 0], { threshold: 0.5 });
      expect(results.map(r => r.document.id)).toEqual(['same', 'diagonal']);
    });

    it('limit 截断结果数量', async () => {
      const results = await svc.semanticSearch('p1', [1, 0], { limit: 1 });
      expect(results).toHaveLength(1);
      expect(results[0]?.document.id).toBe('same');
    });

    it('结果不携带完整嵌入向量，metadata.name 取 knowledgeItemId', async () => {
      const results = await svc.semanticSearch('p1', [1, 0]);
      expect(results[0]?.document.embedding).toEqual([]);
      expect(results[0]?.metadata.name).toBe('ki-same');
    });

    it('维度不匹配按 0 分处理，零向量文档同样 0 分', async () => {
      await svc.addDocuments('p1', [doc('mismatch', [1, 0, 0]), doc('zero', [0, 0])]);
      const results = await svc.semanticSearch('p1', [1, 0], { threshold: -1 });
      const byId = new Map(results.map(r => [r.document.id, r.score]));
      expect(byId.get('mismatch')).toBe(0);
      expect(byId.get('zero')).toBe(0);
      expect(byId.get('same')).toBeCloseTo(1, 9);
    });
  });

  describe('hybridSearch 加权合并', () => {
    beforeEach(async () => {
      await svc.addDocuments('p1', [
        doc('semantic-hit', [1, 0], { content: 'the protagonist walks' }),
        doc('keyword-only', [0, 1], { content: 'dragon flies high above' }),
      ]);
    });

    it('默认权重（常量 0.7 / 0.3）下综合分 = 语义分 * 0.7 + 关键词分 * 0.3', async () => {
      const results = await svc.hybridSearch('p1', [1, 0], 'protagonist dragon');
      expect(results).toHaveLength(2);
      const byId = new Map(results.map(r => [r.document.id, r]));
      const semanticHit = byId.get('semantic-hit');
      const keywordOnly = byId.get('keyword-only');
      expect(semanticHit?.semanticScore).toBeCloseTo(1, 9);
      expect(semanticHit?.keywordScore).toBeCloseTo(0.5, 9);
      expect(semanticHit?.combinedScore).toBeCloseTo(DEFAULT_SEMANTIC_WEIGHT * 1 + DEFAULT_KEYWORD_WEIGHT * 0.5, 9);
      expect(keywordOnly?.semanticScore).toBeCloseTo(0, 9);
      expect(keywordOnly?.keywordScore).toBeCloseTo(0.5, 9);
      expect(keywordOnly?.combinedScore).toBeCloseTo(DEFAULT_KEYWORD_WEIGHT * 0.5, 9);
      expect(results[0]?.document.id).toBe('semantic-hit');
    });

    it('自定义权重覆盖默认值', async () => {
      const results = await svc.hybridSearch('p1', [1, 0], 'protagonist dragon', {
        semanticWeight: 0.9,
        keywordWeight: 0.1,
      });
      const byId = new Map(results.map(r => [r.document.id, r]));
      expect(byId.get('semantic-hit')?.combinedScore).toBeCloseTo(0.9 * 1 + 0.1 * 0.5, 9);
      expect(byId.get('keyword-only')?.combinedScore).toBeCloseTo(0.1 * 0.5, 9);
    });

    it('limit 截断并保留综合分最高者', async () => {
      const results = await svc.hybridSearch('p1', [1, 0], 'protagonist', { limit: 1 });
      expect(results).toHaveLength(1);
      expect(results[0]?.document.id).toBe('semantic-hit');
    });
  });

  describe('getCollectionStats', () => {
    it('空集合：count 0、dimensions 取显式参数或缺省 384、categories 空', async () => {
      const stats = await svc.getCollectionStats('p-empty');
      expect(stats.count).toBe(0);
      expect(stats.dimensions).toBe(384);
      expect(stats.categories).toEqual({});
      expect(stats.lastUpdated).toBeGreaterThan(0);

      const withDims = await svc.getCollectionStats('p-empty', 128);
      expect(withDims.dimensions).toBe(128);
    });

    it('从文档自动检测维度并按 category 统计', async () => {
      await svc.addDocuments('p1', [
        doc('d1', [1, 0, 1, 0, 1, 0, 1]),
        doc('d2', [0, 1, 0, 1, 0, 1, 0], { metadata: { category: 'outline', type: 'note', size: 5, addedAt: 2 } }),
      ]);
      const stats = await svc.getCollectionStats('p1');
      expect(stats.count).toBe(2);
      expect(stats.dimensions).toBe(7);
      expect(stats.categories).toEqual({ character: 1, outline: 1 });
    });
  });

  it('cleanupCollection 清空项目集合', async () => {
    await svc.addDocuments('p1', [doc('d1', [1, 0])]);
    await expect(svc.cleanupCollection('p1')).resolves.toBe(true);
    const stats = await svc.getCollectionStats('p1');
    expect(stats.count).toBe(0);
  });

  describe('checkConsistency', () => {
    it('一致集合：isConsistent true、score 1、无冲突', async () => {
      await svc.addDocuments('p1', [doc('d1', embed384()), doc('d2', embed384())]);
      const result = await svc.checkConsistency('p1');
      expect(result.isConsistent).toBe(true);
      expect(result.score).toBe(1);
      expect(result.conflicts).toEqual([]);
    });

    it('projectId 不一致产出 high 级 metadata_inconsistency 冲突', async () => {
      await svc.addDocuments('p1', [doc('d1', embed384(), { projectId: 'other' })]);
      const result = await svc.checkConsistency('p1');
      expect(result.isConsistent).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]?.type).toBe('metadata_inconsistency');
      expect(result.conflicts[0]?.severity).toBe('high');
      expect(result.score).toBeCloseTo(0.9, 9);
    });

    it('空嵌入产出 missing_embedding 冲突', async () => {
      await svc.addDocuments('p1', [doc('d1', [])]);
      const result = await svc.checkConsistency('p1');
      expect(result.conflicts.map(c => c.type)).toEqual(['missing_embedding']);
      expect(result.conflicts[0]?.severity).toBe('high');
    });

    it('非常规维度（非 384 / 1024）产出 low 级 embedding_dimension_unusual 冲突', async () => {
      await svc.addDocuments('p1', [doc('d1', [1, 0, 1, 0, 1, 0, 1])]);
      const result = await svc.checkConsistency('p1');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]?.type).toBe('embedding_dimension_unusual');
      expect(result.conflicts[0]?.severity).toBe('low');
    });

    it('多类冲突叠加时按数量扣减 score', async () => {
      await svc.addDocuments('p1', [
        doc('d1', [], { projectId: 'other' }),
        doc('d2', [1, 0, 1]),
      ]);
      const result = await svc.checkConsistency('p1');
      expect(result.isConsistent).toBe(false);
      expect(result.conflicts.map(c => c.type).sort()).toEqual([
        'embedding_dimension_unusual',
        'metadata_inconsistency',
        'missing_embedding',
      ]);
      expect(result.score).toBeCloseTo(0.7, 9);
    });
  });
});

describe('VectorService（Electron IPC 模式）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubElectron = (vector: Record<string, unknown>): void => {
    vi.stubGlobal('window', { electronAPI: { vector } });
  };

  it('initialize 成功：走主进程初始化，addDocuments 委托 IPC 并返回 id 列表', async () => {
    const addDocuments = vi.fn().mockResolvedValue({ success: true, ids: ['e1', 'e2'] });
    stubElectron({ initialize: vi.fn().mockResolvedValue({ success: true }), addDocuments });

    const svc = new VectorService();
    await expect(svc.initialize()).resolves.toBe(true);

    const ids = await svc.addDocuments('p-e', [doc('e1', [1, 0]), doc('e2', [0, 1])]);
    expect(ids).toEqual(['e1', 'e2']);
    expect(addDocuments).toHaveBeenCalledWith('p-e', expect.any(Array));
  });

  it('initialize 失败：降级为内存模式，数据落内存', async () => {
    stubElectron({ initialize: vi.fn().mockResolvedValue({ success: false, error: 'main-process down' }) });

    const svc = new VectorService();
    await expect(svc.initialize()).resolves.toBe(true);

    await svc.addDocuments('p-e', [doc('e1', [1, 0])]);
    const stats = await svc.getCollectionStats('p-e');
    expect(stats.count).toBe(1);
  });

  it('initialize 抛异常：返回 false', async () => {
    stubElectron({ initialize: vi.fn().mockRejectedValue(new Error('ipc broken')) });

    const svc = new VectorService();
    await expect(svc.initialize()).resolves.toBe(false);
  });

  it('IPC 语义搜索失败时返回空数组', async () => {
    stubElectron({
      initialize: vi.fn().mockResolvedValue({ success: true }),
      semanticSearch: vi.fn().mockResolvedValue({ success: false, error: 'search failed' }),
    });

    const svc = new VectorService();
    await svc.initialize();
    await expect(svc.semanticSearch('p-e', [1, 0])).resolves.toEqual([]);
  });

  it('IPC 更新文档透传成功状态', async () => {
    const updateDocument = vi.fn().mockResolvedValue({ success: true });
    stubElectron({ initialize: vi.fn().mockResolvedValue({ success: true }), updateDocument });

    const svc = new VectorService();
    await svc.initialize();
    await expect(svc.updateDocument('p-e', doc('e1', [1, 0]))).resolves.toBe(true);
    expect(updateDocument).toHaveBeenCalledWith('p-e', expect.objectContaining({ id: 'e1' }));
  });

  it('IPC 统计失败时回退到内存统计（空集合）', async () => {
    stubElectron({
      initialize: vi.fn().mockResolvedValue({ success: true }),
      getStats: vi.fn().mockResolvedValue({ success: false, error: 'stats failed' }),
    });

    const svc = new VectorService();
    await svc.initialize();
    const stats = await svc.getCollectionStats('p-e');
    expect(stats.count).toBe(0);
    expect(stats.dimensions).toBe(384);
  });
});
