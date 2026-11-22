/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { uuidv7 } from '@core/entities';

import { dt, i18n, templateDisplayName } from '@/i18n';

import type { CardPromptTemplate, EmbeddingModelConfig, ModelConfig, PromptTemplate, ProviderConfig } from '../../../shared/types';
import { embeddingProviders, getDefaultEmbeddingParams } from '../../constants/embeddingProviders';
import type { CardPromptImportResult, EmbeddingQuickAddTemplate } from './types';

export const createNewProviderConfig = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: `provider-${Date.now().toString(36)}`,
  name: i18n.t('settings:factories.newProvider'),
  provider: 'openai-chat',
  endpoint: '',
  ...over,
});

export const createNewModelConfig = (providerId: string, modelName = ''): ModelConfig => ({
  id: `model-${Date.now().toString(36)}`,
  name: modelName || i18n.t('settings:factories.newModel'),
  providerId,
  isEnabled: true,
  modelName,
});

export const createNewPromptTemplate = (): PromptTemplate => ({
  id: Date.now().toString(),
  category: 'edit',
  name: i18n.t('settings:factories.newPolishTemplate'),
  content: '请润色：{content}',
});

export const createDefaultEmbeddingConfig = (): EmbeddingModelConfig => ({
  id: Date.now().toString(),
  name: i18n.t('settings:factories.newEmbeddingModel'),
  provider: 'siliconflow',
  endpoint: 'https://api.siliconflow.cn/v1',
  modelName: 'BAAI/bge-m3',
  dimensions: 1024,
  maxSequenceLength: 8192,
  batchSize: 16,
  timeout: 30000,
  normalizeEmbeddings: true,
  poolingStrategy: 'mean',
  truncate: 'end',
  isActive: false,
  testStatus: 'untested',
});

export const createQuickAddEmbeddingConfig = (template: EmbeddingQuickAddTemplate): EmbeddingModelConfig => {
  const provider = embeddingProviders.find((item) => item.id === template.provider);
  const defaultParams = getDefaultEmbeddingParams(template.provider);

  return {
    id: Date.now().toString(),
    name: dt(template.nameKey),
    provider: template.provider,
    endpoint: provider?.endpoint || '',
    modelName: template.modelName,
    apiKey: '',
    dimensions: defaultParams.dimensions,
    maxSequenceLength: defaultParams.maxSequenceLength,
    batchSize: defaultParams.batchSize,
    timeout: defaultParams.timeout,
    normalizeEmbeddings: defaultParams.normalizeEmbeddings,
    poolingStrategy: defaultParams.poolingStrategy,
    truncate: defaultParams.truncate,
    isActive: false,
    testStatus: 'untested',
  };
};

export const createNewCardPromptTemplate = (): CardPromptTemplate => ({
  id: Date.now().toString(),
  category: 'card-character',
  name: i18n.t('settings:factories.newCharacterTemplate'),
  content: '请根据描述创建角色：\n\n{description}\n\n项目背景：\n{context}',
  variables: ['description', 'context'],
  isDefault: false,
  requiredFields: ['name', 'gender', 'age', 'role', 'personality'],
  fieldDescriptions: {
    name: '角色姓名',
    gender: '性别',
    age: '年龄',
    role: '角色类型',
    personality: '性格特征',
  },
});

export const duplicateCardPromptTemplate = (prompt: CardPromptTemplate): CardPromptTemplate => ({
  ...prompt,
  id: Date.now().toString(),
  // 副本转为自定义模板：烘焙当前语言显示名，清除内置键
  name: i18n.t('settings:factories.duplicateName', { name: templateDisplayName(prompt) }),
  nameKey: undefined,
  isDefault: false,
});

export const importCardPromptTemplates = (
  jsonString: string,
  validateCardPromptTemplate: (template: CardPromptTemplate) => { isValid: boolean; errors: string[] },
): CardPromptImportResult => {
  try {
    const imported = JSON.parse(jsonString) as CardPromptTemplate[];
    const validPrompts = imported.filter((prompt) => validateCardPromptTemplate(prompt).isValid);
    const prompts = validPrompts.map((prompt) => ({
      ...prompt,
      id: Date.now().toString() + uuidv7(),
      isDefault: false,
    }));

    return {
      success: true,
      count: prompts.length,
      prompts,
    };
  } catch {
    return {
      success: false,
      error: i18n.t('settings:factories.importFailedJson'),
    };
  }
};
