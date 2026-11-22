/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import type { CardPromptTemplate } from '../../../../shared/types';
import {
  createNewCardPromptTemplate,
  createNewModelConfig,
  createNewPromptTemplate,
  createNewProviderConfig,
  duplicateCardPromptTemplate,
  importCardPromptTemplates,
} from '../factories';

describe('供应商与模型工厂', () => {
  it('createNewProviderConfig：默认 OpenAI 兼容协议，空地址，显示名取文案', () => {
    const provider = createNewProviderConfig();
    expect(provider.provider).toBe('openai-chat');
    expect(provider.endpoint).toBe('');
    expect(provider.name).toBe('新供应商');
    expect(provider.id.startsWith('provider-')).toBe(true);
  });

  it('createNewProviderConfig：传入字段覆盖默认值', () => {
    const provider = createNewProviderConfig({ name: '我的中转', provider: 'anthropic', endpoint: 'https://x/v1' });
    expect(provider).toMatchObject({ name: '我的中转', provider: 'anthropic', endpoint: 'https://x/v1' });
  });

  it('createNewModelConfig：归属传入供应商，有模型名时作为显示名，默认启用', () => {
    const model = createNewModelConfig('provider-1', 'deepseek-v4-pro');
    expect(model).toMatchObject({
      providerId: 'provider-1',
      modelName: 'deepseek-v4-pro',
      name: 'deepseek-v4-pro',
      isEnabled: true,
    });
  });

  it('createNewModelConfig：没有模型名时显示名取文案', () => {
    const model = createNewModelConfig('provider-1');
    expect(model.name).toBe('新模型');
    expect(model.modelName).toBe('');
  });
});

describe('模板工厂', () => {
  it('新建提示词模板带编辑分类和润色占位符', () => {
    expect(createNewPromptTemplate()).toMatchObject({ category: 'edit', content: '请润色：{content}' });
  });

  it('新建卡牌模板带角色分类与必填字段', () => {
    const template = createNewCardPromptTemplate();
    expect(template.category).toBe('card-character');
    expect(template.requiredFields).toContain('name');
    expect(template.isDefault).toBe(false);
  });

  it('复制卡牌模板换成新 id，并烘焙当前语言显示名', () => {
    const source: CardPromptTemplate = {
      ...createNewCardPromptTemplate(),
      id: 'src',
      name: '旧名',
      nameKey: 'settings:cardPrompts.builtin.character',
      isDefault: true,
    };
    const copy = duplicateCardPromptTemplate(source);
    expect(copy.id).not.toBe('src');
    expect(copy.nameKey).toBeUndefined();
    expect(copy.isDefault).toBe(false);
    expect(copy.name.length).toBeGreaterThan(0);
  });

  it('导入卡牌模板：合法条目换新 id，非法条目丢弃', () => {
    const valid = { ...createNewCardPromptTemplate(), id: 'a' };
    const invalid = { ...valid, id: 'b', name: '' };
    const result = importCardPromptTemplates(JSON.stringify([valid, invalid]), (t) => ({
      isValid: t.name.length > 0,
      errors: [],
    }));
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.prompts?.[0]?.id).not.toBe('a');
  });

  it('导入 JSON 损坏时返回失败而不是抛错', () => {
    const result = importCardPromptTemplates('{not json', () => ({ isValid: true, errors: [] }));
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
