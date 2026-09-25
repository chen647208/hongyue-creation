/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';

vi.mock('../ai/gatewayClient', () => ({
  gatewayHttp: vi.fn(),
}));

vi.mock('../embeddingConfigStore', () => ({
  embeddingConfigStore: {
    getAll: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    setActive: vi.fn(),
    getActive: vi.fn(),
    getById: vi.fn(),
  },
}));

import type { EmbeddingModelConfig } from '../../../../shared/types';
import { gatewayHttp } from '../ai/gatewayClient';
import { embeddingConfigStore } from '../embeddingConfigStore';
import { embeddingModelService } from '../embeddingModelService';

const httpMock = vi.mocked(gatewayHttp);
const storeMock = vi.mocked(embeddingConfigStore);

const httpOk = (body: unknown, status = 200): { ok: boolean; status: number; statusText: string; text: string } =>
  ({ ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'Error', text: JSON.stringify(body) });

const cfg = (over: Partial<EmbeddingModelConfig> = {}): EmbeddingModelConfig =>
  ({
    id: 'e1',
    name: '测试嵌入',
    provider: 'openai-compatible',
    endpoint: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    modelName: 'text-embedding-x',
    dimensions: 3,
    maxSequenceLength: 512,
    batchSize: 2,
    timeout: 1000,
    normalizeEmbeddings: false,
    poolingStrategy: 'mean',
    truncate: 'end',
    isActive: false,
    ...over,
  }) as EmbeddingModelConfig;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('配置 CRUD 委托与激活缓存', () => {
  it('getAll/save/remove/setActive/getById 全部委托给 embeddingConfigStore', async () => {
    const list = [cfg()];
    vi.mocked(storeMock.getAll).mockResolvedValue(list);
    vi.mocked(storeMock.save).mockResolvedValue(true);
    vi.mocked(storeMock.remove).mockResolvedValue(true);
    vi.mocked(storeMock.setActive).mockResolvedValue(true);
    vi.mocked(storeMock.getById).mockResolvedValue(list[0]!);

    expect(await embeddingModelService.getAllConfigs()).toBe(list);
    expect(await embeddingModelService.saveConfig(list[0]!)).toBe(true);
    expect(storeMock.save).toHaveBeenCalledWith(list[0]!);
    expect(await embeddingModelService.deleteConfig('e1')).toBe(true);
    expect(storeMock.remove).toHaveBeenCalledWith('e1');
    expect(await embeddingModelService.setActiveConfig('e1')).toBe(true);
    expect(storeMock.setActive).toHaveBeenCalledWith('e1');
    expect(await embeddingModelService.getConfigById('e1')).toBe(list[0]!);
  });

  it('getActiveConfig 命中缓存后不再读 store；clearCache 后重新读取', async () => {
    const first = cfg();
    vi.mocked(storeMock.getActive).mockResolvedValueOnce(first).mockResolvedValueOnce(null);

    expect(await embeddingModelService.getActiveConfig()).toBe(first);
    expect(await embeddingModelService.getActiveConfig()).toBe(first); // 缓存
    expect(storeMock.getActive).toHaveBeenCalledTimes(1);

    embeddingModelService.clearCache();
    expect(await embeddingModelService.getActiveConfig()).toBeNull();
    expect(storeMock.getActive).toHaveBeenCalledTimes(2);
  });
});

describe('fetchModels', () => {
  it('ollama 走 /api/tags 并解析 models[].name；请求失败向上抛出', async () => {
    httpMock.mockResolvedValueOnce(httpOk({ models: [{ name: 'nomic-embed-text' }, { name: '' }, {}] }));
    expect(await embeddingModelService.fetchModels(cfg({ provider: 'ollama', endpoint: 'http://localhost:11434/' })))
      .toEqual(['nomic-embed-text']);

    const url = httpMock.mock.calls[0]![0]!.url;
    expect(url).toBe('http://localhost:11434/api/tags');

    httpMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Err', text: '' });
    await expect(embeddingModelService.fetchModels(cfg({ provider: 'ollama' }))).rejects.toThrow();
  });

  it('OpenAI 兼容系列走 /models，携带 apiKeyRef/apiKeyHost，按嵌入关键词过滤', async () => {
    httpMock.mockResolvedValueOnce(httpOk({ data: [{ id: 'text-embedding-3' }, { id: 'gpt-9' }, { id: 'BGE-M3' }] }));
    const result = await embeddingModelService.fetchModels(cfg({ provider: 'siliconflow' }));
    expect(result).toEqual(['text-embedding-3', 'BGE-M3']);

    const request = httpMock.mock.calls[0]![0]!;
    expect(request.url).toBe('https://api.example.com/v1/models');
    expect(request.apiKeyRef).toBe('sk-test');
    expect(request.apiKeyHost).toBe('api.example.com');
  });

  it('无嵌入关键词命中时返回全量列表；404 返回空列表；其他失败也回空列表不抛错', async () => {
    httpMock.mockResolvedValueOnce(httpOk({ data: [{ id: 'chat-x' }, { id: 'chat-y' }] }));
    expect(await embeddingModelService.fetchModels(cfg({ provider: 'volcano' }))).toEqual(['chat-x', 'chat-y']);

    httpMock.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found', text: '' });
    expect(await embeddingModelService.fetchModels(cfg({ provider: 'bailian' }))).toEqual([]);

    httpMock.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', text: '' });
    expect(await embeddingModelService.fetchModels(cfg({ provider: 'lmstudio' }))).toEqual([]);
  });

  it('未知 provider 返回空列表', async () => {
    expect(await embeddingModelService.fetchModels(cfg({ provider: 'nope' as never }))).toEqual([]);
    expect(httpMock).not.toHaveBeenCalled();
  });
});

describe('getEmbeddings（分批与请求体）', () => {
  it('按 batchSize 分批，请求体含 model/input/encoding_format，结果按输入顺序拼接', async () => {
    const vec = (n: number): number[] => [n, n, n];
    httpMock.mockImplementation(async (request: { body?: string }) => {
      const body = JSON.parse(request.body!) as { input: string[] };
      return httpOk({ data: body.input.map((_, i) => ({ index: i, embedding: vec(body.input.length * 10 + i) })) });
    });

    const embeddings = await embeddingModelService.getEmbeddings(cfg({ batchSize: 2 }), ['a', 'b', 'c', 'd', 'e']);
    expect(embeddings).toEqual([vec(20), vec(21), vec(20), vec(21), vec(10)]);
    expect(httpMock).toHaveBeenCalledTimes(3);

    const first = httpMock.mock.calls[0]![0]!;
    expect(first.method).toBe('POST');
    expect(first.url).toBe('https://api.example.com/v1/embeddings');
    expect(JSON.parse(first.body!)).toEqual({ model: 'text-embedding-x', input: ['a', 'b'], encoding_format: 'float' });
    expect(first.apiKeyHost).toBe('api.example.com');
    expect(first.timeoutMs).toBe(1000);
  });

  it('getEmbedding 返回单个向量；bailian provider 且配置 dimensions 时请求体追加 dimensions', async () => {
    httpMock.mockResolvedValueOnce(httpOk({ data: [{ index: 0, embedding: [1, 2, 3] }] }));
    expect(await embeddingModelService.getEmbedding(cfg(), 'hello')).toEqual([1, 2, 3]);

    httpMock.mockResolvedValueOnce(httpOk({ data: [{ index: 0, embedding: [1, 2, 3] }] }));
    await embeddingModelService.getEmbedding(cfg({ provider: 'bailian', dimensions: 1024 }), 'hello');
    expect(JSON.parse(httpMock.mock.calls[1]![0]!.body!)).toEqual({
      model: 'text-embedding-x', input: ['hello'], encoding_format: 'float', dimensions: 1024,
    });
  });

  it('bailian 未配置 dimensions 时不追加；非 bailian 配了也不追加', async () => {
    httpMock.mockResolvedValue(httpOk({ data: [{ index: 0, embedding: [1] }] }));
    await embeddingModelService.getEmbedding(cfg({ provider: 'bailian', dimensions: 0 }), 'x');
    await embeddingModelService.getEmbedding(cfg({ provider: 'siliconflow', dimensions: 1024 }), 'x');
    expect(JSON.parse(httpMock.mock.calls[0]![0]!.body!).dimensions).toBeUndefined();
    expect(JSON.parse(httpMock.mock.calls[1]![0]!.body!).dimensions).toBeUndefined();
  });

  it('响应按 index 排序还原顺序；normalizeEmbeddings 时做 L2 归一化', async () => {
    httpMock.mockResolvedValueOnce(httpOk({
      data: [{ index: 1, embedding: [0, 3] }, { index: 0, embedding: [3, 0] }],
    }));
    const unordered = await embeddingModelService.getEmbeddings(cfg(), ['x']);
    expect(unordered).toEqual([[3, 0], [0, 3]]);

    httpMock.mockResolvedValueOnce(httpOk({
      data: [{ index: 0, embedding: [3, 4] }],
    }));
    const normalized = await embeddingModelService.getEmbedding(cfg({ normalizeEmbeddings: true }), 'x');
    expect(normalized).toEqual([0.6, 0.8]);
  });

  it('空 data 数组抛 embedBadFormat 文案', async () => {
    httpMock.mockResolvedValueOnce(httpOk({ data: [] }));
    await expect(embeddingModelService.getEmbedding(cfg(), 'x')).rejects.toThrow(
      i18n.t('settings:embedding.embedBadFormat')
    );
  });
});

describe('fetchEmbeddings 错误分支', () => {
  it('API 错误响应：优先取 error.message，其次 message，最后兜底文案', async () => {
    httpMock.mockResolvedValueOnce({ ok: false, status: 429, statusText: '', text: JSON.stringify({ error: { message: '配额不足' } }) });
    await expect(embeddingModelService.getEmbedding(cfg(), 'x')).rejects.toThrow('配额不足');

    httpMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: '', text: JSON.stringify({ message: '服务器炸了' }) });
    await expect(embeddingModelService.getEmbedding(cfg(), 'x')).rejects.toThrow('服务器炸了');

    httpMock.mockResolvedValueOnce({ ok: false, status: 502, statusText: 'Bad Gateway', text: '{"status":"err"}' });
    await expect(embeddingModelService.getEmbedding(cfg(), 'x')).rejects.toThrow(
      i18n.t('settings:embedding.apiRequestFailed', { status: 502, detail: '{"status":"err"}' })
    );
  });

  it('ollama 嵌入逐条发送 prompt；非 2xx 抛错；embedding 缺失抛格式错误', async () => {
    httpMock.mockResolvedValueOnce(httpOk({ embedding: [1, 2] }));
    expect(await embeddingModelService.getEmbedding(cfg({ provider: 'ollama', endpoint: 'http://127.0.0.1:11434' }), '你好'))
      .toEqual([1, 2]);
    const request = httpMock.mock.calls[0]![0]!;
    expect(request.url).toBe('http://127.0.0.1:11434/api/embeddings');
    expect(JSON.parse(request.body!)).toEqual({ model: 'text-embedding-x', prompt: '你好' });

    httpMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Err', text: 'boom' });
    await expect(embeddingModelService.getEmbedding(cfg({ provider: 'ollama' }), 'x')).rejects.toThrow(
      i18n.t('settings:embedding.ollamaEmbedFailed', { status: 500, detail: 'boom' })
    );

    httpMock.mockResolvedValueOnce(httpOk({ embedding: [] }));
    await expect(embeddingModelService.getEmbedding(cfg({ provider: 'ollama' }), 'x')).rejects.toThrow(
      i18n.t('settings:embedding.ollamaBadFormat')
    );
  });

  it('不支持的 provider 抛 unsupportedProvider 文案', async () => {
    await expect(embeddingModelService.getEmbedding(cfg({ provider: 'nope' as never }), 'x')).rejects.toThrow(
      i18n.t('settings:embedding.unsupportedProvider', { provider: 'nope' })
    );
  });

  it('网络层抛错（gatewayHttp reject）向上传播', async () => {
    httpMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(embeddingModelService.getEmbedding(cfg(), 'x')).rejects.toThrow('ECONNREFUSED');
  });
});

describe('testConnection', () => {
  it('成功返回维度与模型名；空向量判失败；异常返回错误消息', async () => {
    httpMock.mockResolvedValueOnce(httpOk({ data: [{ index: 0, embedding: [1, 2, 3, 4] }] }));
    const okResult = await embeddingModelService.testConnection(cfg());
    expect(okResult.success).toBe(true);
    expect(okResult.dimensions).toBe(4);
    expect(okResult.modelName).toBe('text-embedding-x');
    expect(typeof okResult.latency).toBe('number');

    // data 为空数组在 fetchEmbeddings 层即抛 embedBadFormat，testConnection 捕获后判失败
    httpMock.mockResolvedValueOnce(httpOk({ data: [] }));
    const emptyResult = await embeddingModelService.testConnection(cfg());
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.error).toBe(i18n.t('settings:embedding.embedBadFormat'));

    // 向量条目为空数组：成功但维度为 0
    httpMock.mockResolvedValueOnce(httpOk({ data: [{ index: 0, embedding: [] }] }));
    const zeroDim = await embeddingModelService.testConnection(cfg());
    expect(zeroDim.success).toBe(true);
    expect(zeroDim.dimensions).toBe(0);

    httpMock.mockRejectedValueOnce(new Error('超时'));
    const errResult = await embeddingModelService.testConnection(cfg());
    expect(errResult.success).toBe(false);
    expect(errResult.error).toBe('超时');
  });
});

describe('calculateSimilarity', () => {
  it('同向为 1，正交为 0，零向量与维度不匹配为 0', () => {
    expect(embeddingModelService.calculateSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(embeddingModelService.calculateSimilarity([1, 0], [0, 1])).toBe(0);
    expect(embeddingModelService.calculateSimilarity([0, 0], [1, 1])).toBe(0);
    expect(embeddingModelService.calculateSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe('validateConfig', () => {
  it('合法云配置通过；本地 provider 免 apiKey', () => {
    expect(embeddingModelService.validateConfig(cfg())).toEqual({ valid: true });
    expect(embeddingModelService.validateConfig(cfg({ provider: 'ollama', apiKey: undefined })).valid).toBe(true);
  });

  it('缺 endpoint / 缺模型名 / 非法 URL / 云端缺 key / 维度与批量越界，逐项判无效', () => {
    expect(embeddingModelService.validateConfig(cfg({ endpoint: '' })).error)
      .toBe(i18n.t('settings:embedding.validateEndpointEmpty'));
    expect(embeddingModelService.validateConfig(cfg({ modelName: '' })).error)
      .toBe(i18n.t('settings:embedding.validateModelNameEmpty'));
    expect(embeddingModelService.validateConfig(cfg({ endpoint: 'not-a-url' })).error)
      .toBe(i18n.t('settings:embedding.validateEndpointFormat'));
    expect(embeddingModelService.validateConfig(cfg({ apiKey: '' })).error)
      .toBe(i18n.t('settings:embedding.validateCloudNeedsKey'));
    expect(embeddingModelService.validateConfig(cfg({ dimensions: 0 })).error)
      .toBe(i18n.t('settings:embedding.validateDimensions'));
    expect(embeddingModelService.validateConfig(cfg({ batchSize: 101 })).error)
      .toBe(i18n.t('settings:embedding.validateBatchSize'));
    expect(embeddingModelService.validateConfig(cfg({ batchSize: 0 })).valid).toBe(false);
  });
});
