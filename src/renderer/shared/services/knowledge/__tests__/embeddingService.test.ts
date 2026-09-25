/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VectorDocument } from '../../../../../shared/types';

vi.mock('../../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { embeddingService, SimpleEmbeddingService } from '../embeddingService';

const vdoc = (id: string, embedding: number[]): VectorDocument => ({
  id,
  projectId: 'p1',
  knowledgeItemId: `ki-${id}`,
  content: `content of ${id}`,
  embedding,
  metadata: { category: 'chapter', type: 'text', size: 10, addedAt: 1 },
});

const norm = (v: number[]): number => Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));

describe('SimpleEmbeddingService 状态与初始化', () => {
  it('初始状态：未就绪、模型名与维度为内置值、lastUsed 为 0', () => {
    const svc = new SimpleEmbeddingService();
    expect(svc.getStatus()).toEqual({ isReady: false, modelName: 'simple-tfidf-embedding', dimensions: 384, lastUsed: 0 });
  });

  it('initialize 成功后置为就绪并记录 lastUsed', async () => {
    const svc = new SimpleEmbeddingService();
    await expect(svc.initialize()).resolves.toBe(true);
    const status = svc.getStatus();
    expect(status.isReady).toBe(true);
    expect(status.lastUsed).toBeGreaterThan(0);
  });

  it('getDimensions 返回 384', () => {
    expect(new SimpleEmbeddingService().getDimensions()).toBe(384);
  });

  it('embedText 在未初始化时自动初始化', async () => {
    const svc = new SimpleEmbeddingService();
    const embedding = await svc.embedText('the novel story');
    expect(embedding).toHaveLength(svc.getDimensions());
    expect(svc.getStatus().isReady).toBe(true);
  });

  it('单例导出与类实例一致', () => {
    expect(embeddingService).toBeInstanceOf(SimpleEmbeddingService);
  });
});

describe('SimpleEmbeddingService.embedText / embedTexts', () => {
  let svc: SimpleEmbeddingService;

  beforeEach(() => {
    svc = new SimpleEmbeddingService();
  });

  it('输出为归一化向量（模长 1）', async () => {
    const embedding = await svc.embedText('the protagonist of a long novel');
    expect(embedding).toHaveLength(384);
    expect(norm(embedding)).toBeCloseTo(1, 9);
  });

  it('同一文本生成确定一致的向量', async () => {
    const a = await svc.embedText('dragon story');
    const b = await svc.embedText('dragon story');
    expect(b).toEqual(a);
  });

  it('空文本与全短词（长度 <= 2 被过滤）文本产生零向量', async () => {
    const empty = await svc.embedText('');
    expect(empty).toHaveLength(384);
    expect(empty.every(v => v === 0)).toBe(true);

    const shortWords = await svc.embedText('ab cd ef');
    expect(shortWords.every(v => v === 0)).toBe(true);
  });

  it('extendVocabulary 追加的新词落在指定维度索引上', async () => {
    const before = svc.getVocabularySize();
    svc.extendVocabulary(['zzword1', 'zzword2', 'the']);
    expect(svc.getVocabularySize()).toBe(before + 2);

    const embedding = await svc.embedText('zzword1');
    expect(embedding[before]).toBeCloseTo(1, 9);
  });

  it('embedTexts 逐条生成且与单条 embedText 结果一致', async () => {
    const [a, b] = await svc.embedTexts(['dragon story', 'quiet village']);
    expect(a).toEqual(await svc.embedText('dragon story'));
    expect(b).toEqual(await svc.embedText('quiet village'));
    expect(a).toHaveLength(384);
    expect(b).toHaveLength(384);
  });
});

describe('SimpleEmbeddingService.createVectorDocuments', () => {
  let svc: SimpleEmbeddingService;

  beforeEach(() => {
    svc = new SimpleEmbeddingService();
  });

  it('短内容单 chunk：id 带 chunk 后缀，metadata 完整透传', async () => {
    const docs = await svc.createVectorDocuments('p1', [
      { id: 'k1', content: 'short story', category: 'chapter', type: 'text', size: 11, addedAt: 42 },
    ]);
    const v1 = docs[0];
    if (!v1) throw new Error('createVectorDocuments 应为单条目产出 1 个向量文档');
    expect(v1).toMatchObject({
      id: 'k1_chunk0',
      projectId: 'p1',
      knowledgeItemId: 'k1',
      content: 'short story',
      metadata: { category: 'chapter', type: 'text', size: 11, addedAt: 42, chunkIndex: 0, totalChunks: 1 },
    });
    expect(v1.embedding).toEqual(await svc.embedText('short story'));
  });

  it('多条目全部产出向量文档（覆盖分批循环）', async () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: `k${i}`,
      content: `content number ${i} about writing`,
      category: 'outline' as const,
      type: 'text',
      size: 10,
      addedAt: 1,
    }));
    const docs = await svc.createVectorDocuments('p1', items);
    expect(docs).toHaveLength(25);
    expect(new Set(docs.map(d => d.id)).size).toBe(25);
  });

  it('长内容按句子切分为多个 chunk，且每个 chunk 不超过 1000 字符', async () => {
    const longContent = Array.from(
      { length: 30 },
      (_, i) => `第${i}章讲述主角穿越荒原、遭遇风暴并结识同伴的完整冒险旅程，情节层层推进。`,
    ).join('');
    const [item] = [
      { id: 'long', content: longContent, category: 'chapter' as const, type: 'text', size: longContent.length, addedAt: 1 },
    ];
    const docs = await svc.createVectorDocuments('p1', [item]);

    expect(docs.length).toBeGreaterThan(1);
    const totalChunks = docs[0]?.metadata.totalChunks ?? 0;
    expect(docs).toHaveLength(totalChunks);
    docs.forEach((d, i) => {
      expect(d.metadata.chunkIndex).toBe(i);
      expect(d.content.length).toBeLessThanOrEqual(1000);
      expect(d.embedding).toHaveLength(384);
      expect(d.id).toBe(`long_chunk${i}`);
    });
  });
});

describe('SimpleEmbeddingService.calculateSimilarity', () => {
  const svc = new SimpleEmbeddingService();

  it('同向 = 1、正交 = 0、反向 = -1', () => {
    expect(svc.calculateSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 9);
    expect(svc.calculateSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 9);
    expect(svc.calculateSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 9);
  });

  it('维度不一致或存在零向量时返回 0', () => {
    expect(svc.calculateSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(svc.calculateSimilarity([], [])).toBe(0);
    expect(svc.calculateSimilarity([0, 0], [1, 0])).toBe(0);
  });
});

describe('SimpleEmbeddingService.findMostSimilar', () => {
  it('按与查询向量的相似度降序返回并受 limit 截断', async () => {
    const svc = new SimpleEmbeddingService();
    const queryEmbedding = await svc.embedText('dragon story');
    const docs = [vdoc('hit', queryEmbedding), vdoc('miss', new Array<number>(384).fill(0))];

    const all = await svc.findMostSimilar('dragon story', docs);
    expect(all).toHaveLength(2);
    expect(all[0]?.document.id).toBe('hit');
    expect(all[0]?.similarity).toBeCloseTo(1, 9);

    const limited = await svc.findMostSimilar('dragon story', docs, 1);
    expect(limited).toHaveLength(1);
    expect(limited[0]?.document.id).toBe('hit');
  });
});

describe('SimpleEmbeddingService.clusterDocuments', () => {
  const svc = new SimpleEmbeddingService();

  it('空输入返回空数组', async () => {
    await expect(svc.clusterDocuments([])).resolves.toEqual([]);
  });

  it('方向相近的文档聚为一簇，质心维度等于嵌入维度', async () => {
    // 使用 384 维嵌入：calculateCentroid 产出的质心维度与 this.dimensions 一致，
    // 低维测试向量会因维度不匹配被相似度计算判为 0。
    const basis = (index: number, value = 1): number[] => {
      const v = new Array<number>(384).fill(0);
      v[index] = value;
      return v;
    };
    const a1 = basis(0);
    const a2 = basis(0, 0.95);
    a2[1] = 0.05;
    const b1 = basis(1);
    const docs = [vdoc('a1', a1), vdoc('a2', a2), vdoc('b1', b1)];
    const clusters = await svc.clusterDocuments(docs, 2);

    expect(clusters).toHaveLength(2);
    const totalDocs = clusters.reduce((sum, c) => sum + c.documents.length, 0);
    expect(totalDocs).toBe(3);

    const paired = clusters.find(c => c.documents.length === 2);
    expect(paired?.documents.map(d => d.id).sort()).toEqual(['a1', 'a2']);
    expect(paired?.averageSimilarity).toBeGreaterThan(0.9);
    clusters.forEach(c => expect(c.centroid).toHaveLength(384));
  });
});
