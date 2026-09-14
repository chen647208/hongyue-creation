/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * bundle / profile / 装配树（docs/design/04 §7）。
 *
 * bundle = 一组功能贡献 + 依赖声明；内置 15 feature 以 bundle 声明
 * （dogfooding：官方功能与社区插件同路径）。profile = 发行档：选择启用
 * 哪些 bundle + 全局策略（如 minimal 禁全部 AI）+ 默认关闭的 feature 集合
 * （disabledFeatures，依赖被禁的 feature 连带禁用）。装配树把「当前生效的
 * 每一行装配 + 来源」打印出来（--dump-config 的 GUI 版数据层）。
 */

export interface FeatureDecl {
  /** 功能 id（反向域名尾段命名空间，如 'core.writing'） */
  id: string;
  name: string;
  /** 功能内 AI 触点是否必须可用（minimal 档禁用） */
  ai: boolean;
  /** 依赖的功能 id */
  dependsOn?: string[];
}

export interface Bundle {
  id: string;
  name: string;
  description?: string;
  features: string[];
}

export interface Profile {
  name: string;
  description?: string;
  /** 启用的 bundle id（空 = 仅核心） */
  plugins: string[];
  /** 全局策略：如 { 'ai.request': 'deny' } */
  policies?: Record<string, string>;
  /** 档位默认关闭的内置 feature id；依赖被禁的 feature 在装配树中连带禁用。 */
  disabledFeatures?: readonly string[];
}

/** 内置 15 feature 声明（dogfooding 的核心清单；与 features/ 目录一一对应）。 */
export const BUILTIN_FEATURES: readonly FeatureDecl[] = [
  { id: 'core.inspiration', name: '灵感生成', ai: true },
  { id: 'core.world', name: '世界构建中心', ai: true, dependsOn: ['core.inspiration'] },
  { id: 'core.characters', name: '角色与势力', ai: true, dependsOn: ['core.world'] },
  { id: 'core.outline', name: '小说大纲', ai: true, dependsOn: ['core.inspiration'] },
  { id: 'core.chapters', name: '章节细纲', ai: true, dependsOn: ['core.outline'] },
  { id: 'core.writing', name: '写作编辑器', ai: false, dependsOn: ['core.index'] },
  { id: 'core.knowledge', name: '知识库', ai: true, dependsOn: ['core.writing'] },
  { id: 'core.timeline', name: '时间线', ai: true, dependsOn: ['core.world'] },
  { id: 'core.foreshadowing', name: '伏笔追踪', ai: true, dependsOn: ['core.writing'] },
  { id: 'core.cards', name: '卡片系统', ai: true },
  { id: 'core.consistency', name: '一致性检查', ai: true, dependsOn: ['core.index'] },
  { id: 'core.assistant', name: 'AI 助手', ai: true, dependsOn: ['core.index', 'core.cards'] },
  { id: 'core.settings', name: '设置', ai: false },
  { id: 'core.export', name: '导出构建', ai: false },
  { id: 'core.index', name: '索引引擎', ai: false },
] as const;

export const BUILTIN_BUNDLES: readonly Bundle[] = [
  { id: 'com.hongyue.bundle.core', name: '核心写作', description: '纯写作最小集', features: ['core.settings', 'core.export', 'core.index', 'core.writing', 'core.chapters', 'core.outline', 'core.inspiration'] },
  { id: 'com.hongyue.bundle.world', name: '世界与角色', description: '世界构建/角色势力/时间线/知识库', features: ['core.world', 'core.characters', 'core.timeline', 'core.knowledge'] },
  { id: 'com.hongyue.bundle.ai', name: 'AI 创作套件', description: '助手/卡片/一致性/伏笔（依赖 AI 网关与索引）', features: ['core.assistant', 'core.cards', 'core.consistency', 'core.foreshadowing'] },
] as const;

/** 发行档名（设置面板与 i18n 键以此为准）。 */
export type ReleaseProfileName = 'full' | 'webnovel' | 'literary' | 'minimal';

/** 发行档清单单源：设置面板选项、装配树、AI 策略判断均以此为准。 */
export const RELEASE_PROFILES: readonly (Profile & { name: ReleaseProfileName })[] = [
  { name: 'full', description: '完整功能（15 项全开）', plugins: ['com.hongyue.bundle.core', 'com.hongyue.bundle.world', 'com.hongyue.bundle.ai'], policies: {} },
  { name: 'webnovel', description: '网文连载：保留写作/章节/角色/世界/知识库/一致性/伏笔/AI 助手，默认关闭时间线', plugins: ['com.hongyue.bundle.core', 'com.hongyue.bundle.world', 'com.hongyue.bundle.ai'], policies: {}, disabledFeatures: ['core.timeline'] },
  { name: 'literary', description: '严肃文学：保留写作/大纲/角色/世界/知识库/伏笔/AI 助手，默认关闭章节细纲/一致性/时间线', plugins: ['com.hongyue.bundle.core', 'com.hongyue.bundle.world', 'com.hongyue.bundle.ai'], policies: {}, disabledFeatures: ['core.chapters', 'core.consistency', 'core.timeline'] },
  { name: 'minimal', description: '纯写作最小集（拒绝全部 AI 请求）', plugins: ['com.hongyue.bundle.core'], policies: { 'ai.request': 'deny' } },
];

/** 默认发行档名（无本地偏好时使用）。 */
export const DEFAULT_RELEASE_PROFILE: ReleaseProfileName = 'full';

/** 按名取发行档；未知档名回退默认档。 */
export function profileByName(name: string): Profile {
  const found = RELEASE_PROFILES.find((p) => p.name === name)
    ?? RELEASE_PROFILES.find((p) => p.name === DEFAULT_RELEASE_PROFILE);
  if (!found) throw new Error('RELEASE_PROFILES 缺少默认发行档');
  return found;
}

/** 汇报每行装配的来源（bundle/patch），profile 策略拒绝的行给出原因。 */
export interface AssemblyRow {
  feature: string;
  name: string;
  source: string;
  enabled: boolean;
  reason?: string;
}

/** 装配树：给定 profile 与 bundle 集，输出功能级装配行。 */
export function assemblyTree(profile: Profile, bundles: readonly Bundle[] = BUILTIN_BUNDLES): AssemblyRow[] {
  const enabledBundles = new Set(profile.plugins);
  const featureSource = new Map<string, string>();
  for (const bundle of bundles) {
    for (const feature of bundle.features) {
      if (enabledBundles.has(bundle.id) && !featureSource.has(feature)) {
        featureSource.set(feature, bundle.id);
      }
    }
  }

  const aiDenied = profile.policies?.['ai.request'] === 'deny';
  const disabledByProfile = new Set(profile.disabledFeatures ?? []);
  const rows: AssemblyRow[] = [];
  for (const feature of BUILTIN_FEATURES) {
    const source = featureSource.get(feature.id);
    let enabled = true;
    let reason: string | undefined;
    // 原因优先级：自身策略 > 档位默认关闭 > 依赖传播 > bundle 未启用
    if (feature.ai && aiDenied) {
      enabled = false;
      reason = 'profile 策略拒绝（ai.request: deny）';
    }
    if (enabled && disabledByProfile.has(feature.id)) {
      enabled = false;
      reason = '档位默认关闭';
    }
    if (enabled && feature.dependsOn) {
      for (const dep of feature.dependsOn) {
        const depRow = rows.find((r) => r.feature === dep);
        if (depRow && !depRow.enabled) {
          enabled = false;
          reason = `依赖 ${dep} 被禁用`;
          break;
        }
      }
    }
    if (enabled && !source) {
      enabled = false;
      reason = '所属 bundle 未启用';
    }
    rows.push({ feature: feature.id, name: feature.name, source: source ?? '-', enabled, reason });
  }
  return rows;
}
