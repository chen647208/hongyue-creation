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
import { anthropicAdapter } from '../adapters/anthropic.js';
import { geminiAdapter } from '../adapters/gemini.js';
import { openAICompatibleAdapter } from '../adapters/openai-compatible.js';
import { DEFAULT_TEMPERATURE } from '../types.js';

const baseModel: ModelConfig = {
  id: 'm1',
  name: 'test',
  providerId: 'p1',
  provider: 'openai-chat',
  endpoint: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  modelName: 'gpt-test',
};

/** 构造带 SSE body 的伪 Response */
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openAICompatibleAdapter.complete', () => {
  it('解析内容/token 并剥离代码围栏', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          model: 'gpt-test-v2',
          choices: [{ message: { content: '```text\n你好世界\n```' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
        }),
      ),
    );
    const r = await openAICompatibleAdapter.complete(baseModel, 'hi');
    expect(r.error).toBeUndefined();
    expect(r.content).toBe('你好世界');
    expect(r.model).toBe('gpt-test-v2');
    expect(r.tokens).toEqual({ prompt: 5, completion: 7, total: 12 });
    expect(r.finishReason).toBe('stop');
  });

  it('HTTP 5xx 触发重试后成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('server error', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await openAICompatibleAdapter.complete(baseModel, 'hi', { retries: 2 });
    expect(r.content).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP 401 不重试', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":{"message":"bad key"}}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await openAICompatibleAdapter.complete(baseModel, 'hi', { retries: 2 });
    expect(r.error).toContain('bad key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('附图走 OpenAI 内容数组形态', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'seen' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const images = [{ mime: 'image/png', dataUrl: 'data:image/png;base64,AAA' }];
    const r = await openAICompatibleAdapter.complete(baseModel, '看图', { images });
    expect(r.error).toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '看图' },
        { type: 'image', mime: 'image/png', dataUrl: 'data:image/png;base64,AAA' },
      ],
    });
  });

  it('无图保持字符串形态（行为不变）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'x' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    await openAICompatibleAdapter.complete(baseModel, 'hi');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({ role: 'user', content: 'hi' });
  });

  it('请求携带 system 消息与鉴权头', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'x' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    await openAICompatibleAdapter.complete({ ...baseModel, systemPrompt: '你是助手' }, 'hi');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test' });
    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: '你是助手' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });
});

describe('openAICompatibleAdapter.stream', () => {
  it('SSE 分片在行中间截断时内容完整（回归测试）', async () => {
    const full =
      'data: {"choices":[{"delta":{"content":"第一章"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"的雨夜"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"，刀光一闪。"},"finish_reason":"stop"}]}\n\n' +
      'data: [DONE]\n\n';
    // 故意在 JSON 中间切断
    const slices = [full.slice(0, 20), full.slice(20, 47), full.slice(47, 90), full.slice(90)];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(slices)));

    const chunks: StreamingAIResponse[] = [];
    await openAICompatibleAdapter.stream(baseModel, '写', (c) => chunks.push(c));

    const final = chunks[chunks.length - 1]!;
    expect(final.isComplete).toBe(true);
    expect(final.error).toBeUndefined();
    expect(final.content).toBe('第一章的雨夜，刀光一闪。');
    expect(final.finishReason).toBe('stop');
    // 中间块为累计值
    expect(chunks[0]!.content).toBe('第一章');
    expect(chunks[1]!.content).toBe('第一章的雨夜');
  });

  it('中止信号停止生成', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    const chunks: StreamingAIResponse[] = [];
    await openAICompatibleAdapter.stream(baseModel, '写', (c) => chunks.push(c), { signal: controller.signal });
    expect(chunks[chunks.length - 1]!.error).toBe('生成已取消');
  });

  it('流内 error 事件以错误块收尾，不再当成功', async () => {
    const full =
      'data: {"choices":[{"delta":{"content":"部分"}}]}\n\n' +
      'data: {"error":{"message":"overloaded"}}\n\n' +
      'data: [DONE]\n\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([full])));
    const chunks: StreamingAIResponse[] = [];
    await openAICompatibleAdapter.stream(baseModel, '写', (c) => chunks.push(c));
    const final = chunks[chunks.length - 1]!;
    expect(final.isComplete).toBe(true);
    expect(final.error).toBe('overloaded');
  });
});

describe('geminiAdapter', () => {
  const nativeModel: ModelConfig = {
    ...baseModel,
    provider: 'gemini',
    endpoint: 'https://genai.example.com/v1beta/models',
  };

  it('原生 REST complete 解析 candidates 与 usageMetadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: '结果' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 },
        }),
      ),
    );
    const r = await geminiAdapter.complete(nativeModel, 'hi');
    expect(r.content).toBe('结果');
    expect(r.tokens).toEqual({ prompt: 3, completion: 4, total: 7 });
    expect(r.finishReason).toBe('STOP');
  });

  it('未设 temperature 时回退到统一默认，显式设置则原样透传', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: 'x' }] } }] })),
    );
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    await geminiAdapter.complete(nativeModel, 'hi'); // nativeModel 无 temperature
    let body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.generationConfig.temperature).toBe(DEFAULT_TEMPERATURE);

    await geminiAdapter.complete({ ...nativeModel, temperature: 1.0 }, 'hi');
    body = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
    expect(body.generationConfig.temperature).toBe(1.0);
  });

  it('原生 REST 真流式（streamGenerateContent?alt=sse）', async () => {
    const sse =
      'data: {"candidates":[{"content":{"parts":[{"text":"你好"}]}}]}\n\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":"，作家"}]}}],"usageMetadata":{"totalTokenCount":9}}\n\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([sse.slice(0, 30), sse.slice(30)])));

    const chunks: StreamingAIResponse[] = [];
    await geminiAdapter.stream(nativeModel, 'hi', (c) => chunks.push(c));

    const final = chunks[chunks.length - 1]!;
    expect(final.isComplete).toBe(true);
    expect(final.content).toBe('你好，作家');
    expect(final.tokens?.total).toBe(9);
    // 验证请求 URL 使用了流式端点
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0]![0]).toContain(':streamGenerateContent?alt=sse');
  });

  it('缺少 API Key 时返回明确错误', async () => {
    const r = await geminiAdapter.complete({ ...nativeModel, apiKey: undefined }, 'hi');
    expect(r.error).toContain('API Key');
  });

  it('supportsStreaming=false 时降级为传统模式（notice 级别）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })));
    const chunks: StreamingAIResponse[] = [];
    await geminiAdapter.stream({ ...nativeModel, supportsStreaming: false }, 'hi', (c) => chunks.push(c));
    const final = chunks[chunks.length - 1]!;
    expect(final.isComplete).toBe(true);
    expect(final.content).toBe('ok');
    expect(final.error).toBeUndefined();
  });
});

describe('anthropicAdapter.complete', () => {
  const claudeModel: ModelConfig = {
    ...baseModel,
    provider: 'anthropic',
    endpoint: 'https://api.anthropic.com',
    modelName: 'claude-test',
  };

  it('附图转 image block（base64 拆分）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'seen' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await anthropicAdapter.complete(claudeModel, '看图', {
      images: [{ mime: 'image/png', dataUrl: 'data:image/png;base64,AAA' }],
    });
    expect(r.error).toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const userMsg = (body.messages as Array<{ role: string; content: unknown }>).find((m) => m.role === 'user');
    expect(userMsg?.content).toEqual([
      { type: 'text', text: '看图', cache_control: { type: 'ephemeral' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
    ]);
  });
});
