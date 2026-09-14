/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { beforeAll,describe, expect, it } from 'vitest';

import { changeLanguage,DEFAULT_LANGUAGE, getEffectiveLanguage, i18n, initI18n, normalizeLanguage, SUPPORTED_LANGUAGES } from '../config';

// 绕过类型化键，测试 i18next 自身的缺失回退/插值/复数行为（这些用任意键）。
const tRaw = i18n.t.bind(i18n) as (key: string, options?: Record<string, unknown>) => string;

describe('normalizeLanguage', () => {
  it('归一化 navigator 标签到受支持语言', () => {
    expect(normalizeLanguage('zh-CN')).toBe('zh');
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('zh')).toBe('zh');
  });
  it('不支持或空标签 → undefined', () => {
    expect(normalizeLanguage('fr')).toBeUndefined();
    expect(normalizeLanguage(undefined)).toBeUndefined();
    expect(normalizeLanguage('')).toBeUndefined();
  });
});

describe('initI18n 与取词', () => {
  beforeAll(async () => {
    await initI18n('zh');
  });

  it('幂等：重复 init 不改变已生效语言、不抛错', async () => {
    await initI18n('en');
    expect(getEffectiveLanguage()).toBe('zh');
  });

  it('中文母版取词（含命名空间前缀）', () => {
    expect(i18n.t('settings:tab.general')).toBe('通用');
    expect(i18n.t('settings:title')).toBe('控制台配置');
    expect(i18n.t('common:confirm')).toBe('确定');
  });

  it('缺失键回退返回键名本身', () => {
    expect(tRaw('settings:does.not.exist')).toContain('does');
  });

  it('插值与复数（经 defaultValue，不污染字典）', () => {
    expect(tRaw('x.hello', { defaultValue: '你好 {{name}}', name: '世界' })).toBe('你好 世界');
    expect(tRaw('x.items', { defaultValue_one: '{{count}} 项', defaultValue_other: '{{count}} 项', count: 3 })).toBe('3 项');
  });

  it('支持语言集合与默认值符合约定', () => {
    expect([...SUPPORTED_LANGUAGES]).toEqual(['zh', 'en']);
    expect(DEFAULT_LANGUAGE).toBe('zh');
  });
});

describe('语言切换', () => {
  it('切到英文后关键界面文案来自英文，切回中文无残留', async () => {
    changeLanguage('en');
    await i18n.changeLanguage('en');
    expect(getEffectiveLanguage()).toBe('en');
    expect(i18n.t('settings:tab.general')).toBe('General');
    expect(i18n.t('settings:title')).toBe('Console Settings');
    expect(i18n.t('nav:structureTabs.outline')).toBe('Outline');
    expect(i18n.t('common:confirm')).toBe('Confirm');

    changeLanguage('zh');
    await i18n.changeLanguage('zh');
    expect(getEffectiveLanguage()).toBe('zh');
    expect(i18n.t('settings:tab.general')).toBe('通用');
    expect(i18n.t('common:confirm')).toBe('确定');
  });
});
