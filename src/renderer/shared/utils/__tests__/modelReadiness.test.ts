/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { ModelConfig } from '../../../../shared/types';
import { isModelConfigured } from '../modelReadiness';

const model = (over: Partial<ModelConfig>): ModelConfig =>
  ({ id: 'm', name: 'M', providerId: 'p', provider: 'openai-chat', modelName: 'x', ...over });

describe('isModelConfigured', () => {
  it('null / undefined 视为未配置', () => {
    expect(isModelConfigured(null)).toBe(false);
    expect(isModelConfigured(undefined)).toBe(false);
  });

  it('gemini 需要非空 apiKey（端点可留空走官方默认）', () => {
    expect(isModelConfigured(model({ provider: 'gemini' }))).toBe(false);
    expect(isModelConfigured(model({ provider: 'gemini', apiKey: '   ' }))).toBe(false);
    expect(isModelConfigured(model({ provider: 'gemini', apiKey: 'AIza-xxx' }))).toBe(true);
  });

  it('openai-chat 自定义渠道：需要 endpoint，apiKey 可选', () => {
    expect(isModelConfigured(model({ provider: 'openai-chat' }))).toBe(false);
    expect(isModelConfigured(model({ provider: 'openai-chat', endpoint: 'https://api.x/v1' }))).toBe(true);
    expect(isModelConfigured(model({ provider: 'openai-chat', endpoint: 'https://api.x/v1', apiKey: 'sk-x' }))).toBe(true);
  });

  it('openai-chat 官方渠道（presetId）：需要 endpoint 且需要 apiKey', () => {
    expect(
      isModelConfigured(model({ provider: 'openai-chat', presetId: 'deepseek', endpoint: 'https://api.deepseek.com/v1' })),
    ).toBe(false);
    expect(
      isModelConfigured(model({ provider: 'openai-chat', presetId: 'deepseek', endpoint: 'https://api.deepseek.com/v1', apiKey: 'sk-x' })),
    ).toBe(true);
  });

  it('openai-responses 官方渠道：需要 endpoint 且需要 apiKey', () => {
    expect(
      isModelConfigured(model({ provider: 'openai-responses', presetId: 'openai-responses', endpoint: 'https://api.openai.com/v1' })),
    ).toBe(false);
    expect(
      isModelConfigured(model({ provider: 'openai-responses', presetId: 'openai-responses', endpoint: 'https://api.openai.com/v1', apiKey: 'sk-x' })),
    ).toBe(true);
  });

  it('anthropic 官方渠道需 key，自定义渠道仅需 endpoint', () => {
    expect(
      isModelConfigured(model({ provider: 'anthropic', presetId: 'anthropic', endpoint: 'https://api.anthropic.com' })),
    ).toBe(false);
    expect(
      isModelConfigured(model({ provider: 'anthropic', presetId: 'anthropic', endpoint: 'https://api.anthropic.com', apiKey: 'sk-ant' })),
    ).toBe(true);
    expect(isModelConfigured(model({ provider: 'anthropic', endpoint: 'https://host/anthropic/v1' }))).toBe(true);
  });

  it('ollama 需要 endpoint，无需 apiKey', () => {
    expect(isModelConfigured(model({ provider: 'ollama' }))).toBe(false);
    expect(isModelConfigured(model({ provider: 'ollama', endpoint: 'http://localhost:11434/v1' }))).toBe(true);
  });

  it('自定义 presetId（custom-*/gateway-*）按兼容协议判定：仅需 endpoint', () => {
    expect(
      isModelConfigured(model({ provider: 'openai-chat', presetId: 'custom-openai', endpoint: 'https://api.x/v1' })),
    ).toBe(true);
    expect(
      isModelConfigured(model({ provider: 'openai-chat', presetId: 'gateway-openai', endpoint: 'https://gw.example/v1' })),
    ).toBe(true);
    expect(
      isModelConfigured(model({ provider: 'gemini', presetId: 'custom-gemini', apiKey: 'AIza-xxx' })),
    ).toBe(true);
  });

  it('默认模型（DeepSeek 官方渠道未填 key）应判为未配置，触发首启引导', () => {
    const defaultModel = model({
      id: 'default-deepseek',
      provider: 'openai-chat',
      presetId: 'deepseek',
      endpoint: 'https://api.deepseek.com/v1',
      modelName: 'deepseek-v4-pro',
    });
    expect(isModelConfigured(defaultModel)).toBe(false);
  });
});
