/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 朗读默认值与限制单源（设置页、播放服务、主进程合成共用）。 */
import type { TtsConfig, TtsProvider } from '../types.js';

/** 单段合成上限：云端 TTS 普遍按字符计费并有单次上限，切段后逐段请求。 */
export const TTS_SEGMENT_MAX_CHARS = 600;

/** 一次朗读最多送出的总字符数，防误点整本朗读烧配额。 */
export const TTS_TOTAL_MAX_CHARS = 60_000;

export const TTS_RATE_RANGE = { min: 0.5, max: 2, step: 0.05 } as const;
export const TTS_PITCH_RANGE = { min: 0.5, max: 2, step: 0.05 } as const;

export const TTS_PROVIDERS: readonly TtsProvider[] = ['system', 'openai', 'azure', 'elevenlabs'] as const;

/** 各引擎的 OpenAI 兼容模型默认值。 */
export const TTS_DEFAULT_MODELS: Record<TtsProvider, string> = {
  system: '',
  openai: 'gpt-4o-mini-tts',
  azure: 'neural',
  elevenlabs: 'eleven_multilingual_v2',
};

export const TTS_DEFAULT_VOICES: Record<TtsProvider, string> = {
  system: '',
  openai: 'alloy',
  azure: 'zh-CN-XiaoxiaoNeural',
  elevenlabs: '',
};

export const TTS_DEFAULT_ENDPOINTS: Record<TtsProvider, string> = {
  system: '',
  openai: 'https://api.openai.com/v1',
  azure: '',
  elevenlabs: 'https://api.elevenlabs.io/v1',
};

export const DEFAULT_TTS_CONFIG: TtsConfig = {
  provider: 'system',
  model: TTS_DEFAULT_MODELS.system,
  voice: TTS_DEFAULT_VOICES.system,
  rate: 1,
  pitch: 1,
};

/** 归一化外部读入的配置（缺字段回退默认，越界值夹到区间内）。 */
export function normalizeTtsConfig(raw: Partial<TtsConfig> | null | undefined): TtsConfig {
  const provider = raw?.provider && TTS_PROVIDERS.includes(raw.provider) ? raw.provider : 'system';
  const clamp = (value: unknown, range: { min: number; max: number }, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : fallback;
  return {
    provider,
    endpoint: typeof raw?.endpoint === 'string' && raw.endpoint.trim() ? raw.endpoint.trim() : undefined,
    apiKey: typeof raw?.apiKey === 'string' && raw.apiKey ? raw.apiKey : undefined,
    model: typeof raw?.model === 'string' && raw.model ? raw.model : TTS_DEFAULT_MODELS[provider],
    voice: typeof raw?.voice === 'string' && raw.voice ? raw.voice : TTS_DEFAULT_VOICES[provider],
    region: typeof raw?.region === 'string' && raw.region ? raw.region : undefined,
    rate: clamp(raw?.rate, TTS_RATE_RANGE, 1),
    pitch: clamp(raw?.pitch, TTS_PITCH_RANGE, 1),
  };
}

/**
 * 把长文按句切成适合单次合成的段：优先句末标点，其次逗号与空白，
 * 单段不超过 TTS_SEGMENT_MAX_CHARS；总量截断到 TTS_TOTAL_MAX_CHARS。
 */
export function splitForSpeech(text: string, maxChars = TTS_SEGMENT_MAX_CHARS): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, TTS_TOTAL_MAX_CHARS);
  if (!normalized) return [];
  const segments: string[] = [];
  let current = '';
  const flush = (): void => {
    const piece = current.trim();
    if (piece) segments.push(piece);
    current = '';
  };
  // 逐字符累积，遇到句末标点且已够长就切；超长兜底按长度硬切
  for (const char of normalized) {
    current += char;
    if ((char === '。' || char === '！' || char === '？' || char === '.' || char === '!' || char === '?' || char === '\n')
      && current.trim().length >= maxChars / 3) {
      flush();
    } else if (current.length >= maxChars) {
      flush();
    }
  }
  flush();
  return segments;
}
