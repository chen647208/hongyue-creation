/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type React from 'react';

import type {
  AppLanguage,
  AppTheme,
  CardPromptTemplate,
  ConsistencyCheckConfig,
  ConsistencyCheckPromptTemplate,
  EmbeddingModelConfig,
  ModelConfig,
  PromptTemplate,
  StorageConfig,
  TtsConfig,
} from '../../../shared/types';
import type { ModelProviderInfo } from '../../constants/modelProviders';

export interface SettingsModalProps {
  models: ModelConfig[];
  activeModelId: string | null;
  prompts: PromptTemplate[];
  cardPrompts?: CardPromptTemplate[];
  consistencyPrompts?: ConsistencyCheckPromptTemplate[];
  tts?: TtsConfig;
  consistencyCheckConfig?: ConsistencyCheckConfig;
  onSaveModels: (models: ModelConfig[], activeId: string) => void;
  onSavePrompts: (prompts: PromptTemplate[]) => void;
  onSaveCardPrompts?: (cardPrompts: CardPromptTemplate[]) => void;
  onSaveConsistencyPrompts?: (prompts: ConsistencyCheckPromptTemplate[]) => void;
  onSaveTts?: (tts: TtsConfig) => void;
  onSaveConsistencyConfig?: (config: ConsistencyCheckConfig) => void;
  onClose: () => void;
  onClearData: () => void;
  /** 当前生效界面语言 */
  language: AppLanguage;
  /** 切换界面语言（立即生效并持久化） */
  onLanguageChange: (language: AppLanguage) => void;
  /** 当前界面主题偏好 */
  theme: AppTheme;
  /** 切换界面主题（立即生效并持久化） */
  onThemeChange: (theme: AppTheme) => void;
}

/** 内置页签 + 注册表页签 id（后者任意字符串，保留内置字面量自动补全）。 */
export type SettingsTab = 'models' | 'prompts' | 'card-prompts' | 'consistency-prompts' | 'system' | 'storage' | 'embedding' | 'general' | 'tts' | (string & {});
export type ImportExportMode = 'import' | 'export';

export interface CardPromptTestResult {
  templateId: string;
  isValid: boolean;
  errors: string[];
}

export interface CardPromptImportResult {
  success: boolean;
  count?: number;
  prompts?: CardPromptTemplate[];
  error?: string;
}

export type EmbeddingQuickAddTemplate = {
  nameKey: string;
  provider: EmbeddingModelConfig['provider'];
  modelName: string;
};
export interface StorageSettingsPanelProps {
  storageConfig: StorageConfig;
  setStorageConfig: React.Dispatch<React.SetStateAction<StorageConfig>>;
  onClearData: () => void;
}

export interface EmbeddingSettingsPanelProps {
  embeddingConfigs: EmbeddingModelConfig[];
  activeEmbeddingId: string | null;
  embeddingTestingId: string | null;
  embeddingTestResults: Record<string, string>;
  embeddingModelListLoading: Record<string, boolean>;
  addEmbeddingConfig: () => void;
  removeEmbeddingConfig: (id: string) => void;
  updateEmbeddingConfig: (id: string, updates: Partial<EmbeddingModelConfig>) => void;
  testEmbeddingConnection: (config: EmbeddingModelConfig) => void | Promise<void>;
  fetchEmbeddingModelList: (config: EmbeddingModelConfig) => void | Promise<void>;
  setActiveEmbeddingConfig: (id: string) => void;
  quickAddEmbeddingConfig: (template: EmbeddingQuickAddTemplate) => void;
}

export interface ModelSettingsPanelProps {
  localModels: ModelConfig[];
  activeId: string | null;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  testingId: string | null;
  testResults: Record<string, string>;
  modelListLoading: Record<string, boolean>;
  removeModel: (id: string) => void;
  updateModel: (id: string, updates: Partial<ModelConfig>) => void;
  testModel: (model: ModelConfig) => void | Promise<void>;
  fetchModelList: (model: ModelConfig) => void | Promise<void>;
  addModel: () => void;
}

export interface PromptTemplatesPanelProps {
  localPrompts: PromptTemplate[];
  setLocalPrompts: React.Dispatch<React.SetStateAction<PromptTemplate[]>>;
  updatePrompt: (id: string, updates: Partial<PromptTemplate>) => void;
  addPrompt: () => void;
}

export interface CardPromptSettingsPanelProps {
  localCardPrompts: CardPromptTemplate[];
  editingCardPromptId: string | null;
  setEditingCardPromptId: React.Dispatch<React.SetStateAction<string | null>>;
  cardPromptTestResult: CardPromptTestResult | null;
  importExportModalOpen: boolean;
  setImportExportModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  importExportMode: ImportExportMode;
  setImportExportMode: React.Dispatch<React.SetStateAction<ImportExportMode>>;
  importText: string;
  setImportText: React.Dispatch<React.SetStateAction<string>>;
  addCardPrompt: () => void;
  removeCardPrompt: (id: string) => void;
  updateCardPrompt: (id: string, updates: Partial<CardPromptTemplate>) => void;
  duplicateCardPrompt: (id: string) => void;
  testCardPrompt: (template: CardPromptTemplate) => boolean;
  exportCardPrompts: () => string;
  importCardPrompts: (jsonString: string) => { success: boolean; count?: number; error?: string };
  resetCardPromptsToDefault: () => void;
}

export interface SystemGuidePanelProps {
  onQuickAddProviderModel: (provider: ModelProviderInfo) => void;
}

export interface GeneralSettingsPanelProps {
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

export interface ConsistencyPromptSettingsPanelProps {
  templates: ConsistencyCheckPromptTemplate[];
  onTemplatesChange: (templates: ConsistencyCheckPromptTemplate[]) => void;
}

export interface SettingsModalHeaderProps {
  onClose: () => void;
}

export interface SettingsModalFooterProps {
  onClose: () => void;
  onSave: () => void | Promise<void>;
}

export interface SettingsTabContentProps {
  activeTab: SettingsTab;
  tts: TtsConfig;
  onTtsChange: (tts: TtsConfig) => void;
  localModels: ModelConfig[];
  activeId: string | null;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  testingId: string | null;
  testResults: Record<string, string>;
  modelListLoading: Record<string, boolean>;
  removeModel: (id: string) => void;
  updateModel: (id: string, updates: Partial<ModelConfig>) => void;
  testModel: (model: ModelConfig) => void | Promise<void>;
  fetchModelList: (model: ModelConfig) => void | Promise<void>;
  addModel: () => void;
  localPrompts: PromptTemplate[];
  setLocalPrompts: React.Dispatch<React.SetStateAction<PromptTemplate[]>>;
  updatePrompt: (id: string, updates: Partial<PromptTemplate>) => void;
  addPrompt: () => void;
  localCardPrompts: CardPromptTemplate[];
  editingCardPromptId: string | null;
  setEditingCardPromptId: React.Dispatch<React.SetStateAction<string | null>>;
  cardPromptTestResult: CardPromptTestResult | null;
  importExportModalOpen: boolean;
  setImportExportModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  importExportMode: ImportExportMode;
  setImportExportMode: React.Dispatch<React.SetStateAction<ImportExportMode>>;
  importText: string;
  setImportText: React.Dispatch<React.SetStateAction<string>>;
  addCardPrompt: () => void;
  removeCardPrompt: (id: string) => void;
  updateCardPrompt: (id: string, updates: Partial<CardPromptTemplate>) => void;
  duplicateCardPrompt: (id: string) => void;
  testCardPrompt: (template: CardPromptTemplate) => boolean;
  exportCardPrompts: () => string;
  importCardPrompts: (jsonString: string) => { success: boolean; count?: number; error?: string };
  resetCardPromptsToDefault: () => void;
  localConsistencyPrompts: ConsistencyCheckPromptTemplate[];
  setLocalConsistencyPrompts: React.Dispatch<React.SetStateAction<ConsistencyCheckPromptTemplate[]>>;
  quickAddProviderModel: (provider: ModelProviderInfo) => void;
  storageConfig: StorageConfig;
  setStorageConfig: React.Dispatch<React.SetStateAction<StorageConfig>>;
  onClearData: () => void;
  embeddingConfigs: EmbeddingModelConfig[];
  activeEmbeddingId: string | null;
  embeddingTestingId: string | null;
  embeddingTestResults: Record<string, string>;
  embeddingModelListLoading: Record<string, boolean>;
  addEmbeddingConfig: () => void;
  removeEmbeddingConfig: (id: string) => void;
  updateEmbeddingConfig: (id: string, updates: Partial<EmbeddingModelConfig>) => void;
  testEmbeddingConnection: (config: EmbeddingModelConfig) => void | Promise<void>;
  fetchEmbeddingModelList: (config: EmbeddingModelConfig) => void | Promise<void>;
  setActiveEmbeddingConfig: (id: string) => void;
  quickAddEmbeddingConfig: (template: EmbeddingQuickAddTemplate) => void;
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

