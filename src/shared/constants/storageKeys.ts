/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * localStorage 键单源（渲染层本地偏好，非业务数据）。
 * 业务数据一律走 repository；此处只放不随项目同步的界面/安装级偏好。
 * 新增键先登记，禁止散落字面量。
 */
export const STORAGE_KEYS = {
  onboardingDone: 'onboarding.done',
  onboardingPersona: 'onboarding.persona',
  profileCurrent: 'profile.current',
  approvalMcpConsumed: 'approval.mcp-consumed',
  versionAutoCheck: 'version.autoCheck',
  versionSkipped: 'version.skipped',
  editorTypewriter: 'editor.typewriter',
  editorSnippets: 'editor.snippets',
  editorScreenplayFormat: 'editor.screenplayFormat',
  collabEnabled: 'collab.enabled',
  collabServerUrl: 'collab.serverUrl',
  pluginsDisabled: 'plugins.disabled',
  trustedPluginKeys: 'plugins.trustedKeys',
  allowedPluginSources: 'plugins.allowedSources',
  errorLogs: 'novelocal_error_logs',
  aiUsage: 'ai.usage',
  aiHourlyLimit: 'ai.hourlyLimit',
  appFeaturesDisabled: 'features.disabled',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
