/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Citation } from '@core/ai';
import type React from 'react';

import type { KnowledgeItem, ModelConfig, Project, PromptTemplate } from '../../../shared/types';

export interface GlobalAssistantProps {
  models: ModelConfig[];
  activeModelId: string | null;
  project: Project | null;
  prompts: PromptTemplate[];
  onUpdate?: (updates: Partial<Project>) => void;
  /** 固定右侧边栏宽度（300–560），由 App 层持久化。 */
  width?: number;
  /** 关闭侧边栏（App 层收起）。 */
  onClose?: () => void;
  /** 拖动左边框调整宽度（App 层钳制并持久化）。 */
  onWidthChange?: (width: number) => void;
}

export interface ChatTokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: KnowledgeItem[];
  timestamp: number;
  tokens?: ChatTokenUsage;
  model?: string;
  finishReason?: string;
  error?: string;
  isStreaming?: boolean;
  /** 本轮答复引用的可检索来源（带出处，界面分栏呈现）。 */
  citations?: Citation[];
}

export type AssistantCategory = 'inspiration' | 'knowledge' | 'characters' | 'outline' | 'chapters';
export type AssistantEditCategory = AssistantCategory | 'content';
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface EditingData extends Partial<Project> {
  editingChapterId?: string;
}

export interface AssistantPromptSelection {
  promptId: string;
  templateId: string | null;
}
export interface AssistantEditPanelProps {
  project: Project | null;
  editCategory: AssistantEditCategory;
  editingData: EditingData;
  syncStatus: SyncStatus;
  characterGenerationPrompt: string;
  isGeneratingCharacter: boolean;
  hasModel: boolean;
  setEditingData: React.Dispatch<React.SetStateAction<EditingData>>;
  setEditCategory: React.Dispatch<React.SetStateAction<AssistantEditCategory>>;
  setSyncStatus: React.Dispatch<React.SetStateAction<SyncStatus>>;
  setEditPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setCharacterGenerationPrompt: React.Dispatch<React.SetStateAction<string>>;
  handleOpenEditPanel: (category: AssistantEditCategory) => void;
  handleSaveEdit: () => void;
  handleGenerateCharacter: () => void;
  getChapterContent: (chapterId: string) => string;
}

