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
import { anthropicAdapter, anthropicMessagesUrl, clampAnthropicTemperature } from '../adapters/anthropic.js';

const baseModel: ModelConfig = {
  id: 'a1',
  name: 'claude',
  providerId: 'p1',
  provider: 'anthropic',
  presetId: 'anthropic',
  endpoint: 'https://api.anthropic.com',
  apiKey: 'sk-ant-test',
  modelName: 'claude-sonnet-5',
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

describe('anthropicMessagesUrl', () => {
  it('官方 base 补 /v1/messages', () => {
    expect(anthropicMessagesUrl('https://api.anthropic.com')).toBe('https://api.anthropic.com/v1/messages');
  });
  it('已含 /v1 的网关只补 /messages（MiniMax 形态）', () => {
    expect(anthropicMessagesUrl('https://api.minimaxi.com/anthropic/v1')).toBe('https://api.minimaxi.com/anthropic/v1/messages');
  });
  it('去尾斜杠且已含 /messages 时原样返回', () => {
    expect(anthropicMessagesUrl('https://api.anthropic.com/')).toBe('https://api.anthropic.com/v1/messages');
    expect(anthropicMessagesUrl('https://host/v1/messages')).toBe('https://host/v1/messages');
  });
});

describe('clampAnthropicTemperature', () => {
  it('收敛到 0–1，非法回退默认 0.7', () => {
    expect(clampAnthropicTemperature(0.7)).toBe(0.7);
    expect(clampAnthropicTemperature(1.0)).toBe(1);
    expect(clampAnthropicTemperature(1.8)).toBe(1);
    expect(clampAnthropicTemperature(-0.5)).toBe(0);
    expect(clampAnthropicTemperature(undefined)).toBe(0.7);
    expect(clampAnthropicTemperature(NaN)).toBe(0.7);
  });
});

describe('anthropicAdapter.complete', () => {
  it('解析 content[].text、usage 与 stop_reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          content: [{ type: 'text', text: '```text\n你好世界\n```' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 30 },
        }),
      ),
    );
    const r = await anthropicAdapter.complete(baseModel, 'hi');
    expect(r.error).toBeUndefined();
    expect(r.content).toBe('你好世界');
    expect(r.tokens).toEqual({ prompt: 12, completion: 30, total: 42 });
    expect(r.finishReason).toBe('end_turn');
  });

  it('请求走 x-api-key + anthropic-version，端点规范化，max_tokens 兜底 8192，温度收敛', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await anthropicAdapter.complete({ ...baseModel, temperature: 1.6 }, 'hi');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({ 'x-api-key': 'sk-ant-test', 'anthropic-version': '2023-06-01' });
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(8192);
    expect(body.temperature).toBe(1);
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }] },
    ]);
    expect(body.system).toBeUndefined();
  });

  it('system 提示词走顶层 system 块（带缓存断点），不混入 messages；maxTokens 显式则透传', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await anthropicAdapter.complete({ ...baseModel, systemPrompt: '你是小说家', maxTokens: 4096 }, 'hi');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.system).toEqual([{ type: 'text', text: '你是小说家', cache_control: { type: 'ephemeral' } }]);
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }] },
    ]);
    expect(body.max_tokens).toBe(4096);
  });

  it('响应 usage 含缓存计数时透出 cacheRead/cacheWrite', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1200, output_tokens: 30, cache_creation_input_tokens: 1100, cache_read_input_tokens: 100 },
        }),
      ),
    );
    const r = await anthropicAdapter.complete(baseModel, 'hi');
    expect(r.tokens).toEqual({ prompt: 1200, completion: 30, total: 1230, cacheRead: 100, cacheWrite: 1100 });
  });

  it('缺少 API Key 直接返回错误，不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await anthropicAdapter.complete({ ...baseModel, apiKey: '' }, 'hi');
    expect(r.error).toContain('API Key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('缺少端点直接返回错误，不发请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await anthropicAdapter.complete({ ...baseModel, endpoint: '' }, 'hi');
    expect(r.error).toContain('接口地址');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HTTP 401 不重试并回传上游错误信息', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"type":"error","error":{"message":"invalid api key"}}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await anthropicAdapter.complete(baseModel, 'hi', { retries: 2 });
    expect(r.error).toContain('invalid api key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('anthropicAdapter.stream', () => {
  it('按 SSE 事件累积文本，合并 message_start/message_delta 用量与 stop_reason', async () => {
    const sse =
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\n' +
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"第一章"}}\n\n' +
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"的雨夜"}}\n\n' +
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}\n\n' +
      'event: message_stop\ndata: {"type":"message_stop"}\n\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([sse])));

    const chunks: StreamingAIResponse[] = [];
    await anthropicAdapter.stream(baseModel, '写', (c) => chunks.push(c));

    const last = chunks[chunks.length - 1]!;
    expect(last.isComplete).toBe(true);
    expect(last.content).toBe('第一章的雨夜');
    expect(last.finishReason).toBe('end_turn');
    expect(last.tokens).toEqual({ prompt: 10, completion: 7, total: 17 });
    // 中间增量块为非完成态
    expect(chunks.some((c) => !c.isComplete && c.isStreaming)).toBe(true);
  });

  it('SSE 分片在 JSON 中间截断时内容仍完整（回归）', async () => {
    const sse =
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\n' +
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"世界"}}\n\n' +
      'data: {"type":"message_stop"}\n\n';
    const slices = [sse.slice(0, 25), sse.slice(25, 60), sse.slice(60)];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(slices)));
    const chunks: StreamingAIResponse[] = [];
    await anthropicAdapter.stream(baseModel, '写', (c) => chunks.push(c));
    expect(chunks[chunks.length - 1]!.content).toBe('你好世界');
  });

  it('error 事件以错误块收尾', async () => {
    const sse =
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"部分"}}\n\n' +
      'data: {"type":"error","error":{"message":"overloaded"}}\n\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([sse])));
    const chunks: StreamingAIResponse[] = [];
    await anthropicAdapter.stream(baseModel, '写', (c) => chunks.push(c));
    const last = chunks[chunks.length - 1]!;
    expect(last.isComplete).toBe(true);
    expect(last.error).toContain('overloaded');
  });

  it('supportsStreaming=false 时回退到 complete 并单块输出', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: '回退内容' }], usage: { input_tokens: 1, output_tokens: 2 } })));
    const chunks: StreamingAIResponse[] = [];
    await anthropicAdapter.stream({ ...baseModel, supportsStreaming: false }, '写', (c) => chunks.push(c));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe('回退内容');
    expect(chunks[0]!.isComplete).toBe(true);
  });
});
