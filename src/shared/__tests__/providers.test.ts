/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import { describe, expect, it } from 'vitest';

import { normalizeProvidersAndModels, resolveModels, stripResolvedModel } from '../providers';
import type { ModelConfig, ProviderConfig } from '../types';

const legacyModel = (over: Partial<ModelConfig> & Record<string, unknown>): ModelConfig => ({
  id: 'm1',
  name: 'M1',
  providerId: '',
  modelName: 'model-1',
  ...over,
});

describe('normalizeProvidersAndModels', () => {
  it('旧结构按协议+预设+地址聚合，同一地址的两个模型共用一个供应商', () => {
    const models = [
      legacyModel({ id: 'm1', provider: 'openai-chat', presetId: 'deepseek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'vault:a' }),
      legacyModel({ id: 'm2', provider: 'openai-chat', presetId: 'deepseek', endpoint: 'https://api.deepseek.com/v1' }),
    ];
    const { providers, models: normalized } = normalizeProvidersAndModels(undefined, models);
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({ presetId: 'deepseek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'vault:a' });
    expect(normalized.map((m) => m.providerId)).toEqual([providers[0]!.id, providers[0]!.id]);
    // 落盘条目不再携带供应商字段
    expect(normalized[0]).not.toHaveProperty('endpoint');
    expect(normalized[0]).not.toHaveProperty('apiKey');
  });

  it('不同地址拆成两个供应商', () => {
    const models = [
      legacyModel({ id: 'm1', provider: 'openai-chat', endpoint: 'https://a/v1' }),
      legacyModel({ id: 'm2', provider: 'openai-chat', endpoint: 'https://b/v1' }),
    ];
    const { providers } = normalizeProvidersAndModels(undefined, models);
    expect(providers).toHaveLength(2);
  });

  it('新结构原样保留，按 providerId 归属', () => {
    const providers: ProviderConfig[] = [
      { id: 'p1', name: 'DeepSeek', provider: 'openai-chat', presetId: 'deepseek', endpoint: 'https://api.deepseek.com/v1', availableModels: ['a', 'b'] },
    ];
    const models: ModelConfig[] = [
      { id: 'm1', name: 'A', providerId: 'p1', modelName: 'a' },
      { id: 'm2', name: 'B', providerId: 'p1', modelName: 'b' },
    ];
    const result = normalizeProvidersAndModels(providers, models);
    expect(result.providers).toEqual(providers);
    expect(result.models).toEqual(models);
  });
});

describe('resolveModels / stripResolvedModel', () => {
  const providers: ProviderConfig[] = [
    { id: 'p1', name: 'P', provider: 'anthropic', presetId: 'anthropic', endpoint: 'https://api.anthropic.com', apiKey: 'vault:p1' },
  ];

  it('投影把供应商字段贴到每个模型上', () => {
    const [resolved] = resolveModels(providers, [{ id: 'm1', name: 'M', providerId: 'p1', modelName: 'x' }]);
    expect(resolved).toMatchObject({ provider: 'anthropic', endpoint: 'https://api.anthropic.com', apiKey: 'vault:p1' });
  });

  it('剥离后只剩模型自身字段，providerId 保留', () => {
    const stripped = stripResolvedModel({
      id: 'm1', name: 'M', providerId: 'p1', modelName: 'x',
      provider: 'anthropic', endpoint: 'https://api.anthropic.com', apiKey: 'vault:p1', availableModels: ['x'],
    });
    expect(stripped).toEqual({ id: 'm1', name: 'M', providerId: 'p1', modelName: 'x' });
  });
});
