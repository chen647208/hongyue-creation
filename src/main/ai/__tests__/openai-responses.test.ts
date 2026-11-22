/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { afterEach,describe, expect, it, vi } from 'vitest';
import { beforeAll } from 'vitest';

import { initAiI18n } from '../i18n.js';

beforeAll(async () => {
  await initAiI18n('zh');
});
import type { ModelConfig, StreamingAIResponse } from '../../../shared/types.js';
import { openAIResponsesAdapter, responsesUrl } from '../adapters/openai-responses.js';

const baseModel: ModelConfig = {
  id: 'r1',
  name: 'gpt',
  providerId: 'p1',
  provider: 'openai-responses',
  presetId: 'openai-responses',
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  modelName: 'gpt-5.6',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('responsesUrl', () => {
  it('含 /v1 只补 /responses', () => {
    expect(responsesUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/responses');
  });
  it('不含 /v1 补 /v1/responses，并去尾斜杠', () => {
    expect(responsesUrl('https://api.openai.com')).toBe('https://api.openai.com/v1/responses');
    expect(responsesUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/responses');
  });
  it('已含 /responses 原样返回', () => {
    expect(responsesUrl('https://gw.example.com/v1/responses')).toBe('https://gw.example.com/v1/responses');
  });
});

describe('openAIResponsesAdapter.complete', () => {
  it('解析 output[].content[].output_text、usage 与 status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          model: 'gpt-5.6-2026',
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'output_text', text: '```md\n正文\n```' }] }],
          usage: { input_tokens: 8, output_tokens: 21, total_tokens: 29 },
        }),
      ),
    );
    const r = await openAIResponsesAdapter.complete(baseModel, 'hi');
    expect(r.error).toBeUndefined();
    expect(r.content).toBe('正文');
    expect(r.model).toBe('gpt-5.6-2026');
    expect(r.tokens).toEqual({ prompt: 8, completion: 21, total: 29 });
    expect(r.finishReason).toBe('completed');
  });

  it('请求走 Bearer 鉴权、input/instructions、max_output_tokens，且不下发 temperature', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ output: [{ content: [{ type: 'output_text', text: 'ok' }] }] }));
    vi.stubGlobal('fetch', fetchMock);
    await openAIResponsesAdapter.complete({ ...baseModel, systemPrompt: '你是小说家', maxTokens: 2048, temperature: 1.0 }, 'hi');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    const body = JSON.parse(init.body as string);
    expect(body.input).toBe('hi');
    expect(body.instructions).toBe('你是小说家');
    expect(body.max_output_tokens).toBe(2048);
    expect(body.temperature).toBeUndefined();
    expect(body.stream).toBe(false);
  });

  it('缺少 API Key 直接返回错误，不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await openAIResponsesAdapter.complete({ ...baseModel, apiKey: '' }, 'hi');
    expect(r.error).toContain('API Key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HTTP 429 触发重试后成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ output: [{ content: [{ type: 'output_text', text: 'ok' }] }] }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await openAIResponsesAdapter.complete(baseModel, 'hi', { retries: 2 });
    expect(r.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('openAIResponsesAdapter.stream', () => {
  it('按 response.output_text.delta 累积，response.completed 收尾带 usage/status', async () => {
    const sse =
      'event: response.created\ndata: {"type":"response.created"}\n\n' +
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"第一章"}\n\n' +
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"的雨夜"}\n\n' +
      'event: response.completed\ndata: {"type":"response.completed","response":{"model":"gpt-5.6","status":"completed","usage":{"input_tokens":5,"output_tokens":9,"total_tokens":14}}}\n\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([sse])));

    const chunks: StreamingAIResponse[] = [];
    await openAIResponsesAdapter.stream(baseModel, '写', (c) => chunks.push(c));

    const last = chunks[chunks.length - 1]!;
    expect(last.isComplete).toBe(true);
    expect(last.content).toBe('第一章的雨夜');
    expect(last.finishReason).toBe('completed');
    expect(last.tokens).toEqual({ prompt: 5, completion: 9, total: 14 });
    expect(chunks.some((c) => !c.isComplete && c.isStreaming)).toBe(true);
  });

  it('SSE 分片在 JSON 中间截断时内容仍完整（回归）', async () => {
    const sse =
      'data: {"type":"response.output_text.delta","delta":"你好"}\n\n' +
      'data: {"type":"response.output_text.delta","delta":"世界"}\n\n' +
      'data: {"type":"response.completed","response":{"status":"completed"}}\n\n';
    const slices = [sse.slice(0, 22), sse.slice(22, 55), sse.slice(55)];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(slices)));
    const chunks: StreamingAIResponse[] = [];
    await openAIResponsesAdapter.stream(baseModel, '写', (c) => chunks.push(c));
    expect(chunks[chunks.length - 1]!.content).toBe('你好世界');
  });

  it('error 事件以错误块收尾', async () => {
    const sse =
      'data: {"type":"response.output_text.delta","delta":"部分"}\n\n' +
      'data: {"type":"error","error":{"message":"server_error"}}\n\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([sse])));
    const chunks: StreamingAIResponse[] = [];
    await openAIResponsesAdapter.stream(baseModel, '写', (c) => chunks.push(c));
    const last = chunks[chunks.length - 1]!;
    expect(last.isComplete).toBe(true);
    expect(last.error).toContain('server_error');
  });

  it('supportsStreaming=false 时回退到 complete 并单块输出', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ output: [{ content: [{ type: 'output_text', text: '回退' }] }], usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } })),
    );
    const chunks: StreamingAIResponse[] = [];
    await openAIResponsesAdapter.stream({ ...baseModel, supportsStreaming: false }, '写', (c) => chunks.push(c));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe('回退');
    expect(chunks[0]!.isComplete).toBe(true);
  });
});
