/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 内置 bundle 的 manifest（design/04 §7：官方功能与社区插件同一加载路径）。
 * 以数据形式内嵌（编译进应用、走 PluginHost 同一条 validate/load/activate
 * 路径）；features/ 目录的功能归属见 bundles.ts 的 BUILTIN_FEATURES。
 */
import type { PluginManifest } from '../manifest.js';

export const CORE_BUNDLE_MANIFEST: PluginManifest = {
  id: 'com.hongyue.bundle.core',
  name: 'core',
  version: '2.0.0',
  host: '^2.0.0',
  license: 'AGPL-3.0-only',
  description: '核心写作：书籍库/大纲/章节/写作编辑器/索引/导出',
  dependencies: {},
  activation: 'onStartup',
  contributes: { buildProfiles: ['./builds/'] },
  permissions: { read: ['project', 'fs'], write: ['project', 'editor', 'index', 'fs'] },
};

export const WORLD_BUNDLE_MANIFEST: PluginManifest = {
  id: 'com.hongyue.bundle.world',
  name: 'world',
  version: '2.0.0',
  host: '^2.0.0',
  license: 'AGPL-3.0-only',
  description: '世界与角色：世界构建/角色势力/时间线/知识库',
  dependencies: { 'com.hongyue.bundle.core': '^2.0.0' },
  activation: 'onStartup',
  permissions: { read: ['project'], write: ['project', 'index'] },
};

export const AI_BUNDLE_MANIFEST: PluginManifest = {
  id: 'com.hongyue.bundle.ai',
  name: 'ai',
  version: '2.0.0',
  host: '^2.0.0',
  license: 'AGPL-3.0-only',
  description: 'AI 创作套件：助手/卡片/一致性/伏笔（依赖 AI 网关与索引）',
  dependencies: { 'com.hongyue.bundle.core': '^2.0.0', 'com.hongyue.bundle.world': '^2.0.0' },
  activation: 'onDemand',
  permissions: { read: ['project', 'index'], write: ['ai'] },
};

export const BUILTIN_BUNDLE_MANIFESTS: readonly PluginManifest[] = [
  CORE_BUNDLE_MANIFEST,
  WORLD_BUNDLE_MANIFEST,
  AI_BUNDLE_MANIFEST,
];
