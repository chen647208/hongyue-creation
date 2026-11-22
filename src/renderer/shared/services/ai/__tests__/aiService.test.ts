/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { AIResponse,ModelConfig } from '@shared/types';
import { beforeEach,describe, expect, it, vi } from 'vitest';

const { mockComplete, mockStream } = vi.hoisted(() => ({
  mockComplete: vi.fn(),
  mockStream: vi.fn(),
}));

// 协议实现已上移主进程网关；门面委托类型化客户端，这里桩掉客户端
vi.mock('@/shared/services/ai/gatewayClient.js', () => ({
  aiGatewayClient: { complete: mockComplete, stream: mockStream },
}));

import { AIService } from '../aiService';

const model: ModelConfig = {
  id: 'm1',
  name: 'Test Model',
  providerId: 'p1',
  provider: 'openai-chat',
  endpoint: 'https://example.com/v1',
  modelName: 'test-model',
  temperature: 1,
  maxTokens: 1024,
  supportsStreaming: true,
};

const okResponse = (content: string, extra: Partial<AIResponse> = {}): AIResponse => ({
  content,
  model: 'test-model',
  tokens: { prompt: 1, completion: 2, total: 3 },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildHistoryRecordData', () => {
  it('映射模型/响应/元数据字段并生成唯一 id', () => {
    const record = AIService.buildHistoryRecordData('ch1', 'prompt', 'content', model, okResponse('x'), {
      templateName: 'T',
      batchGeneration: true,
      chapterTitle: '第一章',
      operationType: 'polish',
    });
    expect(record.chapterId).toBe('ch1');
    expect(record.prompt).toBe('prompt');
    expect(record.generatedContent).toBe('content');
    expect(record.modelConfig).toEqual({ modelName: 'test-model', provider: 'openai-chat', temperature: 1, maxTokens: 1024 });
    expect(record.tokens).toEqual({ prompt: 1, completion: 2, total: 3 });
    expect(record.metadata?.templateName).toBe('T');
    expect(record.metadata?.operationType).toBe('polish');
    expect(record.id.startsWith('history_')).toBe(true);
  });

  it('无元数据时 metadata 为 undefined', () => {
    const record = AIService.buildHistoryRecordData('ch1', 'p', 'c', model, okResponse('x'));
    expect(record.metadata).toBeUndefined();
  });
});

describe('call', () => {
  it('无模型时返回错误且不抛异常', async () => {
    const res = await AIService.call(null as unknown as ModelConfig, 'p');
    expect(res.content).toBe('');
    expect(res.error).toBeTruthy();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('委托网关客户端 complete', async () => {
    mockComplete.mockResolvedValue(okResponse('hello'));
    const res = await AIService.call(model, 'p');
    expect(res.content).toBe('hello');
    expect(mockComplete).toHaveBeenCalledWith(model, 'p', undefined);
  });
});

describe('callJSON', () => {
  it('无模型时返回错误', async () => {
    const res = await AIService.callJSON(null as unknown as ModelConfig, 'p');
    expect(res.raw).toBe('');
    expect(res.error).toBeTruthy();
  });

  it('合法 JSON 一次成功', async () => {
    mockComplete.mockResolvedValue(okResponse('{"a":1}'));
    const res = await AIService.callJSON<{ a: number }>(model, 'p');
    expect(res.data).toEqual({ a: 1 });
    expect(res.error).toBeUndefined();
  });
});

describe('testConnection', () => {
  it('错误响应返回 [ERROR] 前缀', async () => {
    mockComplete.mockResolvedValue({ content: '', error: 'boom' } as AIResponse);
    const log = await AIService.testConnection(model);
    expect(log.startsWith('[ERROR]')).toBe(true);
    expect(log).toContain('boom');
  });

  it('包含连接成功/success 返回 [SUCCESS]', async () => {
    mockComplete.mockResolvedValue(okResponse('连接成功'));
    expect((await AIService.testConnection(model)).startsWith('[SUCCESS]')).toBe(true);
    mockComplete.mockResolvedValue(okResponse('OK, success!'));
    expect((await AIService.testConnection(model)).startsWith('[SUCCESS]')).toBe(true);
  });

  it('其他内容返回 [INFO]', async () => {
    mockComplete.mockResolvedValue(okResponse('你好'));
    expect((await AIService.testConnection(model)).startsWith('[INFO]')).toBe(true);
  });
});

describe('callStreaming', () => {
  it('无模型时回调错误并结束', async () => {
    const onChunk = vi.fn();
    await AIService.callStreaming(null as unknown as ModelConfig, 'p', onChunk);
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk.mock.calls[0]![0]!.isComplete).toBe(true);
    expect(onChunk.mock.calls[0]![0]!.error).toBeTruthy();
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('委托网关客户端 stream（降级判定在主进程网关）', async () => {
    mockStream.mockResolvedValue(undefined);
    const onChunk = vi.fn();
    await AIService.callStreaming(model, 'p', onChunk);
    expect(mockStream).toHaveBeenCalledWith(model, 'p', onChunk, undefined);
  });
});
