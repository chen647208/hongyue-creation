/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { DEFAULT_PROMPTS, INITIAL_MODELS } from '../../shared/constants';
import { APP_STATE_VERSION } from '../../shared/constants/versions';
import { type AppState } from '../../shared/types';
import { getDefaultConsistencyPrompts } from '../constants/consistencyCheck';

export const INITIAL_APP_STATE: AppState = {
  schemaVersion: APP_STATE_VERSION,
  projects: [],
  activeProjectId: null,
  models: INITIAL_MODELS,
  prompts: DEFAULT_PROMPTS,
  activeModelId: 'default-deepseek',
  embeddingModels: [],
  activeEmbeddingModelId: null,
  cardPrompts: [],
  consistencyPrompts: getDefaultConsistencyPrompts(),
  consistencyCheckConfig: {
    mode: 'rule',
    selectedPromptTemplates: {},
  },
};

export type ResetModalState = {
  isOpen: boolean;
  type: 'clear_projects' | 'factory_reset' | null;
};

/**
 * 导入版本门：高于当前返回 'too-new'（调用方弹提示并中止），其余 'ok'。
 * 旧版（缺失版本号）一律按可读处理，缺字段由 normalize 回退补齐。
 */
export function checkImportVersion(imported: { schemaVersion?: unknown } | null | undefined): 'ok' | 'too-new' {
  const v = imported?.schemaVersion;
  if (typeof v === 'number' && v > APP_STATE_VERSION) return 'too-new';
  return 'ok';
}

/**
 * 将外部导入的原始状态规范化为一个结构完整、可安全使用的 AppState。
 *
 * 从 App 的“导入全部数据”内联逻辑中抽取而来，使其成为可独立测试的纯函数。
 * 逐字段做类型守卫并回退到默认值；同时保证 activeProjectId 指向一个真实存在的项目。
 *
 * 导入覆盖 cardPrompts / consistencyPrompts / consistencyCheckConfig 三项
 * （缺失时回退到初始默认值），与「覆盖所有数据」的意图一致。
 */
export const normalizeImportedState = (imported: Partial<AppState> | null | undefined): AppState => {
  const src = imported ?? {};
  const projects = Array.isArray(src.projects) ? src.projects : [];

  let activeProjectId = src.activeProjectId || null;
  if (projects.length === 0) {
    activeProjectId = null;
  } else if (!activeProjectId || !projects.some(p => p.id === activeProjectId)) {
    activeProjectId = projects[0]?.id ?? null;
  }

  return {
    schemaVersion: APP_STATE_VERSION,
    projects,
    activeProjectId,
    models: Array.isArray(src.models) ? src.models : INITIAL_APP_STATE.models,
    prompts: Array.isArray(src.prompts) ? src.prompts : INITIAL_APP_STATE.prompts,
    activeModelId: src.activeModelId || 'default-deepseek',
    embeddingModels: Array.isArray(src.embeddingModels) ? src.embeddingModels : [],
    activeEmbeddingModelId: src.activeEmbeddingModelId || null,
    cardPrompts: Array.isArray(src.cardPrompts) ? src.cardPrompts : INITIAL_APP_STATE.cardPrompts,
    consistencyPrompts: Array.isArray(src.consistencyPrompts) ? src.consistencyPrompts : INITIAL_APP_STATE.consistencyPrompts,
    consistencyCheckConfig: src.consistencyCheckConfig ?? INITIAL_APP_STATE.consistencyCheckConfig,
    language: src.language === 'zh' || src.language === 'en' ? src.language : INITIAL_APP_STATE.language,
    theme: src.theme === 'light' || src.theme === 'dark' || src.theme === 'system' ? src.theme : INITIAL_APP_STATE.theme,
    uiFont: typeof src.uiFont === 'string' ? src.uiFont : INITIAL_APP_STATE.uiFont,
    editorFont: typeof src.editorFont === 'string' ? src.editorFont : INITIAL_APP_STATE.editorFont,
    customFonts: Array.isArray(src.customFonts) ? src.customFonts : [],
    mcpServers: Array.isArray(src.mcpServers) ? src.mcpServers : [],
    uiFontSize: typeof src.uiFontSize === 'number' ? src.uiFontSize : INITIAL_APP_STATE.uiFontSize,
    editorFontSize: typeof src.editorFontSize === 'number' ? src.editorFontSize : INITIAL_APP_STATE.editorFontSize,
    editorLineHeight: typeof src.editorLineHeight === 'number' ? src.editorLineHeight : INITIAL_APP_STATE.editorLineHeight,
    proxy: src.proxy && typeof src.proxy.url === 'string' ? { url: src.proxy.url } : undefined,
    minimizeToTray: typeof src.minimizeToTray === 'boolean' ? src.minimizeToTray : undefined,
    autoLaunch: typeof src.autoLaunch === 'boolean' ? src.autoLaunch : undefined,
  };
};




