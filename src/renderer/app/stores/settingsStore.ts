/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 设置 store（06 篇 §2.2 双 store 划分：设置/元数据切片）。
 *
 * 模型、提示词、一致性模板、外观与语言等低频全局配置；经 persistDiff 的
 * saveSettings 分片差分落盘，与项目 store 的逐书写路径互不阻塞。
 */

import { create } from 'zustand';

import { type AppLanguage, type AppState, type AppTheme, type CardPromptTemplate, type ConsistencyCheckPromptTemplate, type CustomFontMeta, type EmbeddingModelConfig, type McpServerConfig, type ModelConfig, type PromptTemplate, type ProxyConfig } from '../../../shared/types';
import { changeLanguage } from '../../i18n';
import { applyTheme } from '../../shared/services/themeService';
import { INITIAL_APP_STATE } from '../initialState';

type ConsistencyConfig = NonNullable<AppState['consistencyCheckConfig']>;

interface SettingsState {
  models: ModelConfig[];
  activeModelId: string | null;
  prompts: PromptTemplate[];
  cardPrompts: CardPromptTemplate[];
  consistencyPrompts: ConsistencyCheckPromptTemplate[];
  consistencyCheckConfig: ConsistencyConfig;
  embeddingModels: EmbeddingModelConfig[];
  activeEmbeddingModelId: string | null;
  language: AppLanguage | undefined;
  theme: AppTheme | undefined;
  uiFont: string | undefined;
  editorFont: string | undefined;
  customFonts: CustomFontMeta[];
  mcpServers: McpServerConfig[];
  uiFontSize: number | undefined;
  editorFontSize: number | undefined;
  editorLineHeight: number | undefined;
  proxy: ProxyConfig | undefined;
  minimizeToTray: boolean | undefined;
  autoLaunch: boolean | undefined;
  /** 从 repository 载入的初始状态整体灌入（首启动/全量导入）。 */
  hydrate: (patch: Partial<SettingsState>) => void;
  setModels: (models: ModelConfig[], activeModelId: string | null) => void;
  /** 全局助手/顶栏切换模型时直写，消除 GlobalAssistant 私设 currentModelId 分叉。 */
  setActiveModelId: (activeModelId: string | null) => void;
  setPrompts: (prompts: PromptTemplate[]) => void;
  setCardPrompts: (cardPrompts: CardPromptTemplate[]) => void;
  setConsistencyPrompts: (prompts: ConsistencyCheckPromptTemplate[]) => void;
  setConsistencyConfig: (config: ConsistencyConfig) => void;
  setLanguage: (language: AppLanguage) => void;
  setTheme: (theme: AppTheme) => void;
  setUiFont: (uiFont: string) => void;
  setEditorFont: (editorFont: string) => void;
  setUiFontSize: (size: number) => void;
  setEditorFontSize: (size: number) => void;
  setEditorLineHeight: (height: number) => void;
  addCustomFont: (meta: CustomFontMeta) => void;
  removeCustomFont: (id: string) => void;
  setMcpServers: (servers: McpServerConfig[]) => void;
  setProxy: (proxy: ProxyConfig | undefined) => void;
  setMinimizeToTray: (minimizeToTray: boolean) => void;
  setAutoLaunch: (autoLaunch: boolean) => void;
}

const {
  models: INIT_MODELS,
  activeModelId: INIT_ACTIVE_MODEL_ID,
  prompts: INIT_PROMPTS,
  cardPrompts: INIT_CARD_PROMPTS = [],
  consistencyPrompts: INIT_CONSISTENCY_PROMPTS = [],
  consistencyCheckConfig: INIT_CONSISTENCY_CONFIG = { mode: 'rule', selectedPromptTemplates: {} },
} = INITIAL_APP_STATE;

export const useSettingsStore = create<SettingsState>()((set) => ({
  models: INIT_MODELS,
  activeModelId: INIT_ACTIVE_MODEL_ID,
  prompts: INIT_PROMPTS,
  cardPrompts: INIT_CARD_PROMPTS,
  consistencyPrompts: INIT_CONSISTENCY_PROMPTS,
  consistencyCheckConfig: INIT_CONSISTENCY_CONFIG,
  embeddingModels: [],
  activeEmbeddingModelId: null,
  language: undefined,
  theme: undefined,
  uiFont: undefined,
  editorFont: undefined,
  customFonts: [],
  mcpServers: [],
  uiFontSize: undefined,
  editorFontSize: undefined,
  editorLineHeight: undefined,
  proxy: undefined,
  minimizeToTray: undefined,
  autoLaunch: undefined,
  hydrate: (patch) => set(patch),
  setModels: (models, activeModelId) => set({ models, activeModelId }),
  setActiveModelId: (activeModelId) => set({ activeModelId }),
  addCustomFont: (meta) => set((s) => ({ customFonts: [...s.customFonts, meta] })),
  removeCustomFont: (id) => set((s) => ({ customFonts: s.customFonts.filter((c) => c.id !== id) })),
  setMcpServers: (mcpServers) => set({ mcpServers }),
  setProxy: (proxy) => set({ proxy }),
  setMinimizeToTray: (minimizeToTray) => set({ minimizeToTray }),
  setAutoLaunch: (autoLaunch) => set({ autoLaunch }),
  setPrompts: (prompts) => set({ prompts }),
  setCardPrompts: (cardPrompts) => set({ cardPrompts }),
  setConsistencyPrompts: (consistencyPrompts) => set({ consistencyPrompts }),
  setConsistencyConfig: (consistencyCheckConfig) => set({ consistencyCheckConfig }),
  // 外观/语言偏好切换在 store 动作内即时生效（i18n 运行时 + <html> 主题）
  setLanguage: (language) => {
    set({ language });
    changeLanguage(language);
  },
  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
  },
  // 字体切换即时生效（App 订阅后写 body/--font-reading），持久化走差分桥
  setUiFont: (uiFont) => set({ uiFont }),
  setEditorFont: (editorFont) => set({ editorFont }),
  setUiFontSize: (uiFontSize) => set({ uiFontSize }),
  setEditorFontSize: (editorFontSize) => set({ editorFontSize }),
  setEditorLineHeight: (editorLineHeight) => set({ editorLineHeight }),
}));

/**
 * 可用模型单源选择器：已启用 && 已配置，跳过停用项。
 * 各 Step/弹窗直读它，不再经 App→View→Step 层层透传 activeModel。
 */
export function useUsableModel(): ModelConfig | undefined {
  const models = useSettingsStore((s) => s.models);
  const activeModelId = useSettingsStore((s) => s.activeModelId);
  return (
    models.find((m) => m.id === activeModelId && m.isEnabled !== false) ??
    models.find((m) => m.isEnabled !== false) ??
    models[0]
  );
}
