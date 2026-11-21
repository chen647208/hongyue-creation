/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 朗读播放（渲染层）：把长文切段后逐段播放，支持中途停止与进度回调。
 *
 * 两个引擎：
 * - system：speechSynthesis 本地合成，离线可用，音色取系统语音；
 * - 其余：主进程 `aiGateway.speak` 合成 mp3 段，这里按序播放并预取下一段。
 *
 * 播放器是单例语义：同一时刻只允许一段朗读，新的朗读会先停掉旧的
 * （两个入口——助手消息与写作区整章——同时点击时不会叠音）。
 */
import { splitForSpeech } from '@shared/constants/tts';
import type { TtsConfig } from '@shared/types';

import { logger } from '../utils/logger';
import { gatewayHttp } from './ai/gatewayClient';

export interface TtsPlayback {
  /** 停止播放并释放音频。 */
  stop(): void;
  /** 当前是否在播放。 */
  readonly playing: boolean;
}

interface PlaybackOptions {
  /** 段序号（从 1 开始）与总段数，用于进度提示。 */
  onProgress?: (index: number, total: number) => void;
  /** 播放结束或失败。error 为空表示正常结束。 */
  onEnd?: (error?: string) => void;
}

let active: TtsPlayback | null = null;

/**
 * 系统语音列表：Chromium 首次 getVoices() 为空，语音包异步就绪。
 * 先等 voiceschanged 事件（最多 3 秒），仍未就绪再轮询一次。
 */
export async function listSystemVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return [];
  const read = (): SpeechSynthesisVoice[] => window.speechSynthesis.getVoices();
  let voices = read();
  if (voices.length > 0) return voices;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 3000);
    function done(): void {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve();
    }
    window.speechSynthesis.addEventListener('voiceschanged', done);
  });
  voices = read();
  for (let i = 0; i < 5 && voices.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    voices = read();
  }
  return voices;
}

/** 停止当前朗读（无播放时为空操作）。 */
export function stopSpeech(): void {
  active?.stop();
  active = null;
}

/** 环境是否支持朗读：系统合成存在，或已配置云端引擎。 */
export function isTtsAvailable(config: TtsConfig): boolean {
  if (config.provider === 'system') {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
      && typeof window.SpeechSynthesisUtterance === 'function';
  }
  return Boolean(window.electronAPI?.aiGateway?.speak);
}

/**
 * 开始朗读文本。文本为空或环境不持时返回 null（调用方据此禁用按钮）。
 * 同声明的文本段不会重复合成：云端按段顺序请求，前一段在播时预取下一段。
 */
export function startSpeech(text: string, config: TtsConfig, options: PlaybackOptions = {}): TtsPlayback | null {
  const segments = splitForSpeech(text);
  if (segments.length === 0 || !isTtsAvailable(config)) return null;
  stopSpeech();

  let stopped = false;
  const handle: TtsPlayback = {
    stop: () => {
      stopped = true;
      cleanup();
    },
    get playing() {
      return !stopped;
    },
  };

  // 各引擎的清理动作在准备阶段填入
  let cleanup: () => void = () => undefined;

  active = handle;
  const finish = (error?: string): void => {
    if (stopped) return;
    stopped = true;
    cleanup();
    if (active === handle) active = null;
    options.onEnd?.(error);
  };

  const setCleanup = (fn: () => void): void => {
    cleanup = fn;
  };
  if (config.provider === 'system') playSystem(segments, config, handle, setCleanup, options, finish);
  else playCloud(segments, config, handle, setCleanup, options, finish);
  return handle;
}

/** 系统语音：按段排队，逐段合成。 */
function playSystem(
  segments: string[],
  config: TtsConfig,
  handle: TtsPlayback,
  setCleanup: (fn: () => void) => void,
  options: PlaybackOptions,
  finish: (error?: string) => void,
): void {
  const synth = window.speechSynthesis;
  let index = 0;
  const voice = config.voice ? synth.getVoices().find((v) => v.name === config.voice) : undefined;
  setCleanup(() => {
    synth.cancel();
  });
  const speakNext = (): void => {
    if (!handle.playing) return;
    const text = segments[index];
    if (!text) {
      finish();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.rate = config.rate;
    utterance.pitch = config.pitch;
    utterance.onstart = () => options.onProgress?.(index + 1, segments.length);
    utterance.onerror = (event) => {
      // canceled/interrupted 是主动停止的结果，不算失败
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      finish(event.error);
    };
    utterance.onend = () => {
      index += 1;
      if (index >= segments.length) finish();
      else speakNext();
    };
    synth.speak(utterance);
  };
  speakNext();
}

/** 云端引擎：按段请求 mp3，播放完一段再放下一段；播放期间预取下一段。 */
function playCloud(
  segments: string[],
  config: TtsConfig,
  handle: TtsPlayback,
  setCleanup: (fn: () => void) => void,
  options: PlaybackOptions,
  finish: (error?: string) => void,
): void {
  const gateway = window.electronAPI?.aiGateway;
  if (!gateway?.speak) {
    finish('tts-unsupported');
    return;
  }
  const pending = new Map<number, Promise<string | null>>();
  let audio: HTMLAudioElement | null = null;

  const requestSegment = (index: number): Promise<string | null> => {
    const cached = pending.get(index);
    if (cached) return cached;
    const text = segments[index];
    if (text === undefined) return Promise.resolve(null);
    const promise = gateway.speak(config, [text]).then((result) => {
      if (!result.ok) {
        // 单段失败向上冒泡，由调用方提示（不静默跳过）
        throw new Error(result.error ?? 'tts-failed');
      }
      return result.segments[0] ?? null;
    });
    pending.set(index, promise);
    return promise;
  };

  const playIndex = async (index: number): Promise<void> => {
    if (!handle.playing) return;
    if (index >= segments.length) {
      finish();
      return;
    }
    options.onProgress?.(index + 1, segments.length);
    // 预取下一段：本段下载中就开始，减少段间静默
    const nextPrefetch = requestSegment(index + 1).catch(() => null);
    let base64: string | null;
    try {
      base64 = await requestSegment(index);
    } catch (error) {
      finish(error instanceof Error ? error.message : String(error));
      return;
    }
    if (!base64 || !handle.playing) {
      void nextPrefetch;
      if (handle.playing) finish();
      return;
    }
    const next = new Audio(`data:audio/mpeg;base64,${base64}`);
    audio = next;
    next.onended = () => {
      audio = null;
      void nextPrefetch.then(() => playIndex(index + 1));
    };
    next.onerror = () => finish('audio-decode-failed');
    next.play().catch((error: unknown) => finish(error instanceof Error ? error.message : String(error)));
  };

  setCleanup(() => {
    audio?.pause();
    audio = null;
  });
  void playIndex(0).catch((error: unknown) => logger.error('tts playback failed:', error));
}

/** 试听：用当前配置合成极短一句，返回可播放的 base64（system 引擎走本地合成，返回 null 由调用方直接播放）。 */
export async function probeSpeech(config: TtsConfig, sample: string): Promise<{ ok: boolean; error?: string }> {
  if (config.provider === 'system') {
    if (!isTtsAvailable(config)) return { ok: false, error: 'tts-unsupported' };
    const playback = startSpeech(sample, config);
    return playback ? { ok: true } : { ok: false, error: 'tts-unsupported' };
  }
  try {
    const result = await window.electronAPI?.aiGateway?.speak(config, [sample]);
    if (!result) return { ok: false, error: 'tts-unsupported' };
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 现有拉表能力复用：供设置页「刷新音色」调用。云端音色列表接口各不相同，这里只做 OpenAI 与 ElevenLabs 的通用路径。 */
export async function listCloudVoices(config: TtsConfig): Promise<string[]> {
  if (config.provider === 'openai') {
    const presets = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];
    return presets;
  }
  if (config.provider === 'elevenlabs' && config.apiKey) {
    const base = (config.endpoint || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
    try {
      const response = await gatewayHttp({ url: `${base}/voices`, apiKeyRef: config.apiKey, apiKeyHeader: 'xi-api-key', apiKeyScheme: 'raw', apiKeyHost: new URL(base).host });
      if (!response.ok) return [];
      const parsed = JSON.parse(response.text) as { voices?: Array<{ voice_id?: string; name?: string }> };
      return (parsed.voices ?? []).map((v) => v.voice_id ?? '').filter(Boolean);
    } catch {
      return [];
    }
  }
  if (config.provider === 'azure' && config.region) {
    // Azure 音色列表为公开文档数据，不做在线拉取；给常用中文音色兜底
    return ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunjianNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunyangNeural'];
  }
  return [];
}
