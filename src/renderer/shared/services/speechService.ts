/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 语音（docs/design/16）：Web Speech API 听写（SpeechRecognition）与朗读
 * （speechSynthesis）。均为浏览器能力，不支持的环境由调用方隐藏入口。
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** 环境是否支持听写。 */
export function isDictationSupported(): boolean {
  return recognitionCtor() !== undefined;
}

/** 环境是否支持朗读。 */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

/** 把 i18n 语言码映射到 Web Speech 的 BCP-47（仅覆盖项目语言）。 */
export function speechLocale(language: string): string {
  return language.startsWith('zh') ? 'zh-CN' : 'en-US';
}

export interface DictationOptions {
  lang?: string;
  /** 识别到一段结果；isFinal 表示该段已定型。 */
  onResult: (text: string, isFinal: boolean) => void;
  onError?: (code: string) => void;
  onEnd?: () => void;
}

export interface DictationController {
  start(): void;
  stop(): void;
  abort(): void;
}

/** 创建一次听写会话；调用方在组件卸载时 abort。 */
export function createDictation(options: DictationOptions): DictationController {
  const Ctor = recognitionCtor();
  if (!Ctor) throw new Error('dictation-unsupported');
  const recognition = new Ctor();
  recognition.lang = options.lang ?? 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result) continue;
      const transcript = result.item(0)?.transcript ?? '';
      if (transcript) options.onResult(transcript, result.isFinal);
    }
  };
  recognition.onerror = (event) => options.onError?.(event.error);
  recognition.onend = () => options.onEnd?.();

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  };
}

export interface SpeechHandle {
  cancel(): void;
}

/** 朗读文本；返回可中止的句柄。重复调用会先停掉上一段。 */
export function speak(text: string, lang = 'zh-CN'): SpeechHandle {
  if (!isSpeechSynthesisSupported()) throw new Error('speech-unsupported');
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
  return { cancel: () => window.speechSynthesis.cancel() };
}
