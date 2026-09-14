/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { beforeAll,describe, expect, it, vi } from 'vitest';

import type { AiStreamEvent, ModelConfig, StreamingAIResponse } from '../../../shared/types.js';
import { initAiI18n } from '../i18n.js';
import type { ProviderAdapter } from '../types.js';

const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }));
vi.mock('../resolve.js', () => ({ resolveAdapter: mockResolve }));

import { performAiHttp,runAdapterStream } from '../gateway.js';

const model = (over: Partial<ModelConfig> = {}): ModelConfig =>
  ({ id: 'm1', name: 'T', provider: 'openai-chat', endpoint: 'https://x/v1', modelName: 'm', ...over });

const okChunk = (content: string, extra: Partial<StreamingAIResponse> = {}): StreamingAIResponse =>
  ({ content, isComplete: false, isStreaming: true, ...extra });

const adapter = (over: Partial<ProviderAdapter>): ProviderAdapter =>
  ({ supportsStreaming: () => true, complete: vi.fn(), stream: vi.fn(), ...over }) as ProviderAdapter;

function collect(events: AiStreamEvent[]): (e: AiStreamEvent) => void {
  return (e) => void events.push(e);
}

beforeAll(async () => {
  await initAiI18n('zh');
});

describe('runAdapterStream（流式核心）', () => {
  it('支持流式时委托适配器并把最终块映射为 done', async () => {
    const stream = vi.fn(async (_m: ModelConfig, _p: string, onChunk: (c: StreamingAIResponse) => void) => {
      onChunk(okChunk('你'));
      onChunk(okChunk('你好', { isComplete: true, isStreaming: false, finishReason: 'stop' }));
    });
    mockResolve.mockReturnValue(adapter({ stream: stream as unknown as ProviderAdapter['stream'] }));

    const events: AiStreamEvent[] = [];
    await runAdapterStream(model(), 'p', 'r1', collect(events), {});

    expect(stream).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ t: 'delta', requestId: 'r1', accumulated: '你' });
    expect(events[1]).toMatchObject({ t: 'done', requestId: 'r1', response: { content: '你好', finishReason: 'stop' } });
  });

  it('模型关闭流式时降级为 complete，结果块带 notice', async () => {
    const complete = vi.fn(async () =>
      ({ content: 'done', model: 'm', tokens: { prompt: 1, completion: 1, total: 2 } }));
    const stream = vi.fn();
    mockResolve.mockReturnValue(adapter({ complete: complete as unknown as ProviderAdapter['complete'], stream: stream as unknown as ProviderAdapter['stream'] }));

    const events: AiStreamEvent[] = [];
    await runAdapterStream(model({ supportsStreaming: false }), 'p', 'r2', collect(events), {});

    expect(stream).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    const done = events[0]!;
    expect(done.t).toBe('done');
    if (done.t === 'done') {
      expect(done.response.isComplete).toBe(true);
      expect(done.response.isStreaming).toBe(false);
      expect(done.response.notice).toBeTruthy();
    }
  });

  it('适配器不支持流式时同样降级', async () => {
    const complete = vi.fn(async () => ({ content: 'd' }));
    mockResolve.mockReturnValue(adapter({ supportsStreaming: () => false, complete: complete as unknown as ProviderAdapter['complete'] }));

    const events: AiStreamEvent[] = [];
    await runAdapterStream(model(), 'p', 'r3', collect(events), {});
    expect(events).toHaveLength(1);
    expect(events[0]!.t).toBe('done');
  });
});

describe('performAiHttp（受控 HTTP 网关）', () => {
  const fakeFetch = (): ReturnType<typeof vi.fn> => vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '{"ok":1}',
  }));

  it('明文 Key 注入 Authorization: Bearer，并透传响应', async () => {
    const fetchMock = fakeFetch();
    vi.stubGlobal('fetch', fetchMock);
    const response = await performAiHttp({ url: 'https://api.x/models', apiKeyRef: 'sk-plain' });
    expect(response).toEqual({ ok: true, status: 200, statusText: 'OK', text: '{"ok":1}' });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-plain');
    vi.unstubAllGlobals();
  });

  it('自定义头名与 raw 方案（Anthropic x-api-key）', async () => {
    const fetchMock = fakeFetch();
    vi.stubGlobal('fetch', fetchMock);
    await performAiHttp({ url: 'https://api.anthropic.com/v1/models', apiKeyRef: 'sk-ant', apiKeyHeader: 'x-api-key', apiKeyScheme: 'raw' });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant');
    vi.unstubAllGlobals();
  });

  it('查询参数注入（Gemini key）不改动请求头', async () => {
    const fetchMock = fakeFetch();
    vi.stubGlobal('fetch', fetchMock);
    await performAiHttp({ url: 'https://generativelanguage.googleapis.com/v1beta/models', apiKeyRef: 'AIza', apiKeyQueryParam: 'key' });
    const url = fetchMock.mock.calls[0]![0] as URL;
    expect(url.searchParams.get('key')).toBe('AIza');
    vi.unstubAllGlobals();
  });

  it('拒绝非 http/https 协议', async () => {
    await expect(performAiHttp({ url: 'file:///etc/passwd' })).rejects.toThrow();
  });
});
