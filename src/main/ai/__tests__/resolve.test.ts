/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { ModelConfig, ModelProvider } from '../../../shared/types.js';
import { anthropicAdapter } from '../adapters/anthropic.js';
import { geminiAdapter } from '../adapters/gemini.js';
import { openAICompatibleAdapter } from '../adapters/openai-compatible.js';
import { openAIResponsesAdapter } from '../adapters/openai-responses.js';
import { resolveAdapter } from '../resolve.js';

const model = (provider: ModelProvider): ModelConfig =>
  ({ id: 'm', name: 'M', providerId: 'p', provider, modelName: 'x' });

describe('resolveAdapter 协议映射', () => {
  it('gemini 走原生适配器', () => {
    expect(resolveAdapter(model('gemini'))).toBe(geminiAdapter);
  });

  it('openai-chat 与 ollama 走 Chat Completions 适配器', () => {
    expect(resolveAdapter(model('openai-chat'))).toBe(openAICompatibleAdapter);
    expect(resolveAdapter(model('ollama'))).toBe(openAICompatibleAdapter);
  });

  it('anthropic 走 Messages 适配器', () => {
    expect(resolveAdapter(model('anthropic'))).toBe(anthropicAdapter);
  });

  it('openai-responses 走 Responses 适配器', () => {
    expect(resolveAdapter(model('openai-responses'))).toBe(openAIResponsesAdapter);
  });
});
