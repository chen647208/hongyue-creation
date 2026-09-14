/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it, vi } from 'vitest';

import {
  inferLocalFlavor,
  localModelsUrl,
  normalizeLocalEndpoint,
  parseLocalModels,
  probeLocalEndpoint,
  resolveInferenceTarget,
} from '../localInference.js';

describe('localInference（本地推理探测与回落）', () => {
  it('端点规范化去尾斜杠', () => {
    expect(normalizeLocalEndpoint('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434');
    expect(normalizeLocalEndpoint('  ')).toBe('');
  });

  it('风味推断：Ollama 默认端口 vs OpenAI 兼容', () => {
    expect(inferLocalFlavor('http://127.0.0.1:11434')).toBe('ollama');
    expect(inferLocalFlavor('http://127.0.0.1:8080/v1')).toBe('openai');
  });

  it('模型列表地址按风味分派', () => {
    expect(localModelsUrl('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434/api/tags');
    expect(localModelsUrl('http://127.0.0.1:8080/v1')).toBe('http://127.0.0.1:8080/v1/models');
  });

  it('解析 OpenAI 兼容模型列表', () => {
    const models = parseLocalModels({ data: [{ id: 'qwen2.5:7b', created: 1700000000 }, { id: '' }] }, 'openai');
    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe('qwen2.5:7b');
  });

  it('解析 Ollama 模型列表', () => {
    const models = parseLocalModels({ models: [{ name: 'llama3', size: 123, details: { family: 'llama' } }] }, 'ollama');
    expect(models[0]).toMatchObject({ id: 'llama3', family: 'llama', sizeBytes: 123 });
  });

  it('探测可达：返回模型', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ models: [{ name: 'llama3' }] }) })) as unknown as typeof fetch;
    const result = await probeLocalEndpoint('http://127.0.0.1:11434', fetchFn);
    expect(result.reachable).toBe(true);
    expect(result.models[0]?.id).toBe('llama3');
  });

  it('探测不可达：返回错误且不抛出', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const result = await probeLocalEndpoint('http://127.0.0.1:11434', fetchFn);
    expect(result.reachable).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('未配置端点：直接判不可达', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const result = await probeLocalEndpoint('', fetchFn);
    expect(result.reachable).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('关闭即回落远程；可达才走本地', () => {
    expect(resolveInferenceTarget({ local: { enabled: false, endpoint: 'http://127.0.0.1:11434' }, localAvailable: true }))
      .toEqual({ kind: 'remote', reason: '本地推理已关闭' });
    expect(resolveInferenceTarget({ local: { enabled: true, endpoint: 'http://127.0.0.1:11434' }, localAvailable: false }))
      .toEqual({ kind: 'remote', reason: '本地端点不可达' });
    expect(resolveInferenceTarget({ local: { enabled: true, endpoint: 'http://127.0.0.1:11434/', model: 'llama3' }, localAvailable: true }))
      .toEqual({ kind: 'local', endpoint: 'http://127.0.0.1:11434', model: 'llama3' });
  });
});
