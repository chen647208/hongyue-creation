/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 云端语音合成（主进程执行）。
 *
 * 渲染层只传配置与已切好的文本段；API Key 在这里解引用并注入，渲染进程不经手明文。
 * 三家契约差异集中在 buildRequest：
 * - OpenAI 兼容：POST {endpoint}/audio/speech，JSON 体，回二进制音频；
 * - Azure 语音：POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1，SSML 体，回二进制；
 * - ElevenLabs：POST {endpoint}/text-to-speech/{voiceId}，JSON 体，回二进制。
 */
import type { TtsConfig, TtsSynthesisResult } from '../../shared/types.js';
import { resolveVaultApiKey, VAULT_UNAVAILABLE } from '../app/secureStore.js';

/** 单段请求超时：合成比文本接口慢，但超过该时长视为失败。 */
const TTS_TIMEOUT_MS = 60_000;

interface TtsRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** 按引擎拼请求；不支持的引擎返回 null。 */
function buildTtsRequest(config: TtsConfig, text: string): { request: TtsRequest; mimeType: string } | null {
  const rate = Math.round(config.rate * 100);
  const pitch = Math.round((config.pitch - 1) * 100);
  switch (config.provider) {
    case 'openai': {
      const base = (config.endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
      return {
        mimeType: 'audio/mpeg',
        request: {
          url: `${base}/audio/speech`,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.model || 'gpt-4o-mini-tts',
            voice: config.voice || 'alloy',
            input: text,
            response_format: 'mp3',
            speed: config.rate,
          }),
        },
      };
    }
    case 'azure': {
      if (!config.region) return null;
      const voice = config.voice || 'zh-CN-XiaoxiaoNeural';
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="${escapeXml(voice)}"><prosody rate="${rate >= 0 ? '+' : ''}${rate}%" pitch="${pitch >= 0 ? '+' : ''}${pitch}%">${escapeXml(text)}</prosody></voice></speak>`;
      return {
        mimeType: 'audio/mpeg',
        request: {
          url: `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
          headers: {
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          },
          body: ssml,
        },
      };
    }
    case 'elevenlabs': {
      if (!config.voice) return null;
      const base = (config.endpoint || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
      return {
        mimeType: 'audio/mpeg',
        request: {
          url: `${base}/text-to-speech/${encodeURIComponent(config.voice)}`,
          headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text,
            model_id: config.model || 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        },
      };
    }
    default:
      return null;
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 逐段合成：任一段失败即整体失败并带出该段错误（不吞掉半截音频）。 */
export async function synthesizeSpeech(config: TtsConfig, segments: string[]): Promise<TtsSynthesisResult> {
  if (config.provider === 'system') return { ok: false, error: 'system-tts-runs-in-renderer' };
  const key = await resolveVaultApiKey(config.apiKey);
  if (config.provider !== 'elevenlabs' && !key) return { ok: false, error: VAULT_UNAVAILABLE };
  if (segments.length === 0) return { ok: false, error: 'empty-input' };

  const outputs: string[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS * segments.length);
  try {
    for (const text of segments) {
      const built = buildTtsRequest(config, text);
      if (!built) return { ok: false, error: 'tts-not-configured' };
      const headers = { ...built.request.headers };
      if (key) headers[config.provider === 'azure' ? 'Ocp-Apim-Subscription-Key' : 'xi-api-key'] = key;
      if (config.provider === 'openai' && key) headers.Authorization = `Bearer ${key}`;
      const response = await fetch(built.request.url, {
        method: 'POST',
        headers,
        body: built.request.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return { ok: false, error: `${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 300)}` : ''}` };
      }
      const buffer = await response.arrayBuffer();
      outputs.push(Buffer.from(buffer).toString('base64'));
    }
    return { ok: true, segments: outputs, mimeType: 'audio/mpeg' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
