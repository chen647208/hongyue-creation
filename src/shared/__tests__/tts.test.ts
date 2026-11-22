/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import {
  DEFAULT_TTS_CONFIG,
  normalizeTtsConfig,
  splitForSpeech,
  TTS_SEGMENT_MAX_CHARS,
  TTS_TOTAL_MAX_CHARS,
} from '@shared/constants/tts';
import { describe, expect,it } from 'vitest';

describe('normalizeTtsConfig', () => {
  it('缺省回退 system 引擎与正常语速', () => {
    expect(normalizeTtsConfig(undefined)).toEqual(DEFAULT_TTS_CONFIG);
    expect(normalizeTtsConfig({})).toEqual(DEFAULT_TTS_CONFIG);
  });

  it('越界语速夹到区间内，非法引擎回落 system', () => {
    const config = normalizeTtsConfig({ provider: 'bogus' as never, rate: 99, pitch: 0.01 });
    expect(config.provider).toBe('system');
    expect(config.rate).toBe(2);
    expect(config.pitch).toBe(0.5);
  });

  it('自动朗读默认关闭，只有显式 true 才开启', () => {
    expect(normalizeTtsConfig(undefined).autoSpeak).toBe(false);
    expect(normalizeTtsConfig({ autoSpeak: 'yes' as never }).autoSpeak).toBe(false);
    expect(normalizeTtsConfig({ autoSpeak: true }).autoSpeak).toBe(true);
  });

  it('保留合法云端配置', () => {
    const config = normalizeTtsConfig({ provider: 'openai', apiKey: 'vault:tts', voice: 'nova', rate: 1.25 });
    expect(config.provider).toBe('openai');
    expect(config.voice).toBe('nova');
    expect(config.rate).toBe(1.25);
  });
});

describe('splitForSpeech', () => {
  it('空文本切出零段', () => {
    expect(splitForSpeech('   ')).toEqual([]);
  });

  it('按句号切段且段内不超过上限', () => {
    const text = '第一句话。第二句话！第三句话？';
    const segments = splitForSpeech(text, 12);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((s) => s.length <= 12)).toBe(true);
    expect(segments.join('')).toBe(text);
  });

  it('超长无标点文本按长度硬切', () => {
    const text = '无'.repeat(TTS_SEGMENT_MAX_CHARS * 2 + 10);
    const segments = splitForSpeech(text);
    expect(segments.length).toBe(3);
    expect(segments.every((s) => s.length <= TTS_SEGMENT_MAX_CHARS)).toBe(true);
  });

  it('总量截断到上限', () => {
    const text = '句。'.repeat(TTS_TOTAL_MAX_CHARS);
    const total = splitForSpeech(text).join('').length;
    expect(total).toBeLessThanOrEqual(TTS_TOTAL_MAX_CHARS);
  });
});
