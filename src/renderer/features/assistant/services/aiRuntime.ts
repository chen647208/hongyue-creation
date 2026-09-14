/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 应用级 AI 运行时（单例装配）。
 * M3 插件宿主在此续注工具/section/技能，UI 层与 Agent 循环只消费这里的实例。
 */
import { ApprovalBroker, PromptAssembler, registerBuiltinSections } from '@core/ai';
import { EventBus, type PluginHost, profileDeniesAi } from '@core/plugin';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';

import { setAiGate } from '@/shared/services/ai/aiGate';
import { isOverHourlyLimit } from '@/shared/services/ai/usageTracker';
import { buildProfileRegistry } from '@/shared/services/buildProfiles';
import { localStore } from '@/shared/services/localStore';
import { formulaRegistry } from '@/shared/services/viewFormulas';
import { APP_VERSION } from '@/shared/version';

import { AiSessionManager } from './aiSessionManager';
import { createToolRegistry } from './builtinTools';
import { createBuiltinSkillCatalog } from './skillCatalogSetup';

const assembler = new PromptAssembler();
registerBuiltinSections(assembler);

export const toolRegistry = createToolRegistry();
export const skillCatalog = createBuiltinSkillCatalog();
export const approvalBroker = new ApprovalBroker();
export const eventBus = new EventBus();

// 精简档 + 每小时配额统一 AI 门：所有经网关的 AI 调用在此实时校验
setAiGate(() => {
  if (typeof window !== 'undefined' && profileDeniesAi(localStore.getItem(STORAGE_KEYS.profileCurrent) ?? 'full')) {
    throw new Error('minimal 发行档已禁用全部 AI 请求');
  }
  if (isOverHourlyLimit()) {
    throw new Error('已达每小时 AI 请求上限，请在设置中调整或稍后重试');
  }
});

export const sessionManager = new AiSessionManager({
  assembler,
  registry: toolRegistry,
  catalog: skillCatalog,
  broker: approvalBroker,
  events: eventBus,
});

// ── 插件宿主 ───────────────────────────────────────────────────

const DISABLED_KEY = STORAGE_KEYS.pluginsDisabled;

function readDisabledList(): string[] {
  try {
    return JSON.parse(localStore.getItem(DISABLED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function saveDisabledList(ids: string[]): void {
  localStore.setItem(DISABLED_KEY, JSON.stringify(ids));
}

/** 启动期插件装载（预览环境无文件系统时空宿主）。状态面板复用同一 Promise。 */
const pluginDeps = {
  skillCatalog,
  buildProfiles: buildProfileRegistry,
  events: eventBus,
  formulas: formulaRegistry,
};

export const pluginHostPromise = import('@/shared/services/pluginService').then((m) =>
  m.bootstrapPlugins(pluginDeps, APP_VERSION, readDisabledList()),
);

/** 安装/卸载后重建宿主：释放旧宿主贡献再重新发现，返回新宿主供面板刷新。 */
export async function reloadPlugins(): Promise<PluginHost> {
  const { reloadPluginHost } = await import('@/shared/services/pluginService');
  const previous = await pluginHostPromise.catch(() => null);
  return reloadPluginHost(pluginDeps, APP_VERSION, previous);
}
