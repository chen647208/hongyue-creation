// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 注入偏好按书持久化：写入后读回，书间互不串扰，损坏内容回落默认。 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  clearInjectionPreferences,
  loadInjectionPreference,
  saveInjectionPreference,
} from '../injectionPreferenceService';

afterEach(() => {
  window.localStorage.clear();
});

describe('injectionPreferenceService', () => {
  it('未登记时回落默认（开启、无关闭条目）', () => {
    expect(loadInjectionPreference('b1')).toEqual({ enabled: true, disabledIds: [] });
  });

  it('按书保存并读回开关与单条关闭', () => {
    saveInjectionPreference('b1', { enabled: false, disabledIds: ['chapter:1:body'] });
    expect(loadInjectionPreference('b1')).toEqual({ enabled: false, disabledIds: ['chapter:1:body'] });
  });

  it('书间互不串扰', () => {
    saveInjectionPreference('b1', { enabled: false, disabledIds: ['x'] });
    saveInjectionPreference('b2', { enabled: true, disabledIds: [] });
    expect(loadInjectionPreference('b1').enabled).toBe(false);
    expect(loadInjectionPreference('b2')).toEqual({ enabled: true, disabledIds: [] });
  });

  it('无活动书时用占位键记录，损坏内容回落默认', () => {
    saveInjectionPreference(undefined, { enabled: false, disabledIds: [] });
    expect(loadInjectionPreference(undefined).enabled).toBe(false);
    window.localStorage.setItem('ai.injectionPrefs', '{broken');
    expect(loadInjectionPreference('b1')).toEqual({ enabled: true, disabledIds: [] });
    clearInjectionPreferences();
    expect(loadInjectionPreference(undefined)).toEqual({ enabled: true, disabledIds: [] });
  });
});
