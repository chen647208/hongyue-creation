/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import { describe, expect,it } from 'vitest';

import {
  createDictation,
  isDictationSupported,
  isSpeechSynthesisSupported,
  speak,
  speechLocale,
} from '@/shared/services/speechService';

// jsdom 不实现 Web Speech API，故这里覆盖"不支持环境"的分支与纯映射函数。
describe('speechLocale', () => {
  it('中文映射到 zh-CN', () => {
    expect(speechLocale('zh')).toBe('zh-CN');
    expect(speechLocale('zh-CN')).toBe('zh-CN');
  });
  it('其余映射到 en-US', () => {
    expect(speechLocale('en')).toBe('en-US');
    expect(speechLocale('fr')).toBe('en-US');
  });
});

describe('speech capability detection', () => {
  it('jsdom 下听写与朗读均判为不支持', () => {
    expect(isDictationSupported()).toBe(false);
    expect(isSpeechSynthesisSupported()).toBe(false);
  });
  it('不支持时创建听写抛错', () => {
    expect(() => createDictation({ onResult: () => {} })).toThrow('dictation-unsupported');
  });
  it('不支持时朗读抛错', () => {
    expect(() => speak('测试')).toThrow('speech-unsupported');
  });
});
