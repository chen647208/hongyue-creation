/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  resolveVaultApiKey: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock('../../app/secureStore.js', () => ({
  resolveVaultApiKey: state.resolveVaultApiKey,
  VAULT_UNAVAILABLE: 'vault-unavailable',
}));

import type { TtsConfig } from '../../../shared/types.js';
import { synthesizeSpeech } from '../tts.js';

const config = (over: Partial<TtsConfig> = {}): TtsConfig => ({
  provider: 'openai',
  endpoint: 'https://api.example.com/v1',
  apiKey: 'vault:tts',
  model: 'tts-1',
  voice: 'alloy',
  rate: 1,
  pitch: 1,
  ...over,
});

function audioResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
}

beforeEach(() => {
  state.resolveVaultApiKey.mockReset().mockResolvedValue('sk-1');
  // Response 体只能读一次，逐次调用返回新对象（一段一个请求）
  state.fetchMock.mockReset().mockImplementation(async () => audioResponse());
  vi.stubGlobal('fetch', state.fetchMock);
});

describe('synthesizeSpeech', () => {
  it('system 引擎由渲染层合成，主进程拒绝', async () => {
    const result = await synthesizeSpeech(config({ provider: 'system' }), ['你好']);
    expect(result.ok).toBe(false);
    expect(state.fetchMock).not.toHaveBeenCalled();
  });

  it('缺 Key 时直接失败且不发请求', async () => {
    state.resolveVaultApiKey.mockResolvedValue(undefined);
    const result = await synthesizeSpeech(config(), ['你好']);
    expect(result).toEqual({ ok: false, error: 'vault-unavailable' });
    expect(state.fetchMock).not.toHaveBeenCalled();
  });

  it('空文本失败', async () => {
    const result = await synthesizeSpeech(config(), []);
    expect(result.ok).toBe(false);
  });

  it('OpenAI 兼容：拼 /audio/speech、带上 Key 与模型，逐段返回 base64', async () => {
    const result = await synthesizeSpeech(config({ rate: 1.5 }), ['第一段', '第二段']);
    expect(result.ok).toBe(true);
    expect(result.segments).toHaveLength(2);
    expect(state.fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = state.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/audio/speech');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-1');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'tts-1', voice: 'alloy', input: '第一段', speed: 1.5 });
  });

  it('gpt-4o-mini-tts 不支持 speed：改走 instructions，且 rate=1 时不发该字段', async () => {
    await synthesizeSpeech(config({ model: 'gpt-4o-mini-tts', rate: 1.5 }), ['hi']);
    const body = JSON.parse((state.fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(body.speed).toBeUndefined();
    expect(body.instructions).toContain('1.5');
    state.fetchMock.mockClear();
    await synthesizeSpeech(config({ model: 'gpt-4o-mini-tts', rate: 1 }), ['hi']);
    const plain = JSON.parse((state.fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(plain.instructions).toBeUndefined();
  });

  it('Azure：SSML 体 + 订阅 Key 头', async () => {
    const result = await synthesizeSpeech(config({ provider: 'azure', region: 'eastasia', voice: 'zh-CN-XiaoxiaoNeural', rate: 1.2 }), ['你好']);
    expect(result.ok).toBe(true);
    const [url, init] = state.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1');
    expect((init.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe('sk-1');
    // Azure 要求必填 User-Agent
    expect((init.headers as Record<string, string>)['User-Agent']).toBeTruthy();
    expect((init.body as string)).toContain('xml:lang="zh-CN"');
    expect((init.body as string)).toContain('<prosody rate="+120%"');
    expect((init.body as string)).toContain('zh-CN-XiaoxiaoNeural');
  });

  it('Azure 缺区域时失败', async () => {
    const result = await synthesizeSpeech(config({ provider: 'azure', region: undefined }), ['你好']);
    expect(result).toEqual({ ok: false, error: 'tts-not-configured' });
  });

  it('ElevenLabs 缺音色时失败，有音色时走 text-to-speech/{voice}', async () => {
    expect((await synthesizeSpeech(config({ provider: 'elevenlabs', voice: '', endpoint: 'https://api.elevenlabs.io/v1' }), ['hi'])).ok).toBe(false);
    const ok = await synthesizeSpeech(config({ provider: 'elevenlabs', voice: 'v1', endpoint: 'https://api.elevenlabs.io/v1' }), ['hi']);
    expect(ok.ok).toBe(true);
    const [url, init] = state.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/v1');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('sk-1');
  });

  it('上游非 2xx 时带出状态与响应片段', async () => {
    state.fetchMock.mockResolvedValue(new Response('quota exceeded', { status: 429, statusText: 'Too Many Requests' }));
    const result = await synthesizeSpeech(config(), ['你好']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('429');
    expect(result.error).toContain('quota exceeded');
  });

  it('fetch 抛错时返回错误信息', async () => {
    state.fetchMock.mockRejectedValue(new Error('network down'));
    const result = await synthesizeSpeech(config(), ['你好']);
    expect(result).toEqual({ ok: false, error: 'network down' });
  });
});
