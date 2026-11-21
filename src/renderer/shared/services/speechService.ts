/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 朗读：浏览器 speechSynthesis 把文本念出来（助手消息、写作区整章朗读）。
 * 不提供听写——语音识别在 Chromium 里要连厂商的在线服务，网络受限时不可用。
 */

/** 环境是否支持朗读。 */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

/** 把 i18n 语言码映射到 Web Speech 的 BCP-47（仅覆盖项目语言）。 */
export function speechLocale(language: string): string {
  return language.startsWith('zh') ? 'zh-CN' : 'en-US';
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
