/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { enabledFeatureIds,profileDeniesAi } from '../availability.js';
import { assemblyTree,BUILTIN_BUNDLES, BUILTIN_FEATURES, DEFAULT_RELEASE_PROFILE, profileByName, RELEASE_PROFILES } from '../bundles.js';

describe('bundle 装配树（design/04 §7）', () => {
  it('全 bundle 启用：15 个内置功能全部装配', () => {
    const rows = assemblyTree(
      { name: 'full', plugins: ['com.hongyue.bundle.core', 'com.hongyue.bundle.world', 'com.hongyue.bundle.ai'] },
      BUILTIN_BUNDLES,
    );
    expect(rows).toHaveLength(BUILTIN_FEATURES.length);
    expect(rows.every((r) => r.enabled)).toBe(true);
    expect(rows.find((r) => r.feature === 'core.writing')?.source).toBe('com.hongyue.bundle.core');
    expect(rows.find((r) => r.feature === 'core.assistant')?.source).toBe('com.hongyue.bundle.ai');
  });

  it('minimal 档：ai.request deny 关闭全部 AI 触点，纯写作保留', () => {
    const rows = assemblyTree(
      { name: 'minimal', plugins: ['com.hongyue.bundle.core'], policies: { 'ai.request': 'deny' } },
      BUILTIN_BUNDLES,
    );
    const writing = rows.find((r) => r.feature === 'core.writing')!;
    const assistant = rows.find((r) => r.feature === 'core.assistant')!;
    expect(writing.enabled).toBe(true);
    expect(assistant.enabled).toBe(false);
    expect(assistant.reason).toContain('ai.request');
  });

  it('依赖传递：世界 bundle 未启用时角色功能连带禁用', () => {
    const rows = assemblyTree(
      { name: 'partial', plugins: ['com.hongyue.bundle.core', 'com.hongyue.bundle.ai'] },
      BUILTIN_BUNDLES,
    );
    const characters = rows.find((r) => r.feature === 'core.characters')!;
    expect(characters.enabled).toBe(false);
    expect(characters.reason).toContain('依赖');
  });

  it('发行档单源：profileByName 取清单项，未知档名回退默认', () => {
    expect(profileByName('minimal')).toBe(RELEASE_PROFILES.find((p) => p.name === 'minimal'));
    expect(profileByName('nope').name).toBe(DEFAULT_RELEASE_PROFILE);
  });

  it('profileDeniesAi：仅 minimal 拒绝 AI', () => {
    expect(profileDeniesAi('minimal')).toBe(true);
    expect(profileDeniesAi('full')).toBe(false);
    expect(profileDeniesAi('webnovel')).toBe(false);
    expect(profileDeniesAi('literary')).toBe(false);
  });

  it('webnovel 档：关闭时间线，保留网文日常链（写作/章节/一致性/伏笔/AI 助手）', () => {
    const webnovel = enabledFeatureIds('webnovel');
    const full = enabledFeatureIds('full');
    expect(webnovel.has('core.timeline')).toBe(false);
    expect(webnovel.has('core.writing')).toBe(true);
    expect(webnovel.has('core.chapters')).toBe(true);
    expect(webnovel.has('core.outline')).toBe(true);
    expect(webnovel.has('core.characters')).toBe(true);
    expect(webnovel.has('core.world')).toBe(true);
    expect(webnovel.has('core.knowledge')).toBe(true);
    expect(webnovel.has('core.consistency')).toBe(true);
    expect(webnovel.has('core.foreshadowing')).toBe(true);
    expect(webnovel.has('core.assistant')).toBe(true);
    expect(webnovel.size).toBe(full.size - 1);
  });

  it('literary 档：关闭章节细纲/一致性/时间线，保留 AI 助手', () => {
    const literary = enabledFeatureIds('literary');
    const rows = assemblyTree(profileByName('literary'), BUILTIN_BUNDLES);
    expect(literary.has('core.chapters')).toBe(false);
    expect(literary.has('core.consistency')).toBe(false);
    expect(literary.has('core.timeline')).toBe(false);
    expect(literary.has('core.assistant')).toBe(true);
    expect(literary.has('core.cards')).toBe(true);
    expect(literary.has('core.outline')).toBe(true);
    expect(literary.has('core.writing')).toBe(true);
    expect(literary.has('core.characters')).toBe(true);
    expect(literary.has('core.world')).toBe(true);
    expect(literary.has('core.knowledge')).toBe(true);
    expect(literary.has('core.foreshadowing')).toBe(true);
    expect(rows.find((r) => r.feature === 'core.chapters')?.reason).toBe('档位默认关闭');
  });

  it('三档 feature 集合互不相同：full ⊃ webnovel ⊃ literary', () => {
    const full = enabledFeatureIds('full');
    const webnovel = enabledFeatureIds('webnovel');
    const literary = enabledFeatureIds('literary');
    expect(full.size).toBe(BUILTIN_FEATURES.length);
    expect(literary.size).toBeLessThan(webnovel.size);
    expect(webnovel.size).toBeLessThan(full.size);
    expect(new Set([...webnovel].filter((id) => !full.has(id))).size).toBe(0);
    expect(new Set([...literary].filter((id) => !webnovel.has(id))).size).toBe(0);
  });

  it('minimal 档位不变：只剩纯写作四项，AI 助手被策略拒绝', () => {
    const minimal = enabledFeatureIds('minimal');
    expect([...minimal].sort()).toEqual(['core.export', 'core.index', 'core.settings', 'core.writing']);
    expect(minimal.has('core.assistant')).toBe(false);
  });
});
