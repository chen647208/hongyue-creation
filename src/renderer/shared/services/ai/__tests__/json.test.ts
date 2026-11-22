/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { beforeEach,describe, expect, it, vi } from 'vitest';

import type { ModelConfig } from '../../../../../shared/types';

const { mockComplete } = vi.hoisted(() => ({ mockComplete: vi.fn() }));
// json.ts 经网关客户端补全（主进程执行），这里桩掉客户端
vi.mock('../gatewayClient.js', () => ({
  aiGatewayClient: { complete: mockComplete, stream: vi.fn() },
}));

import { callJSON,extractJSONCandidate } from '../json';

const model: ModelConfig = {
  id: 'm1',
  name: 'T',
  providerId: 'p1',
  provider: 'openai-chat',
  endpoint: 'https://example.com/v1',
  modelName: 'test-model',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractJSONCandidate', () => {
  it('纯 JSON 原样返回', () => {
    expect(extractJSONCandidate('{"a":1}')).toBe('{"a":1}');
  });

  it('剥离 ```json 围栏', () => {
    expect(extractJSONCandidate('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('剥离无语言标注的围栏', () => {
    expect(extractJSONCandidate('```\n[1,2]\n```')).toBe('[1,2]');
  });

  it('容忍前后说明文字，截取配对括号', () => {
    const out = extractJSONCandidate('好的，这是结果：\n{"name":"甲","tags":["x"]}\n希望有帮助。');
    expect(JSON.parse(out)).toEqual({ name: '甲', tags: ['x'] });
  });

  it('数组输出同样可截取', () => {
    const out = extractJSONCandidate('以下是列表：[{"id":1},{"id":2}] 完毕');
    expect(JSON.parse(out)).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe('callJSON', () => {
  it('一次成功：解析围栏 JSON，raw 保留原始输出', async () => {
    mockComplete.mockResolvedValue({ content: '```json\n{"a":1}\n```' });
    const res = await callJSON<{ a: number }>(model, 'p');
    expect(res.data).toEqual({ a: 1 });
    expect(res.raw).toBe('```json\n{"a":1}\n```');
    expect(res.error).toBeUndefined();
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it('首次非法 JSON 触发修复重试并成功', async () => {
    mockComplete
      .mockResolvedValueOnce({ content: '这不是JSON' })
      .mockResolvedValueOnce({ content: '{"ok":true}' });
    const res = await callJSON<{ ok: boolean }>(model, 'prompt');
    expect(res.data).toEqual({ ok: true });
    expect(mockComplete).toHaveBeenCalledTimes(2);
    const repairPrompt = mockComplete.mock.calls[1]![1] as string;
    expect(repairPrompt.startsWith('prompt')).toBe(true);
    expect(repairPrompt).toContain('修复要求');
  });

  it('重试耗尽仍非法时返回解析错误并保留 raw', async () => {
    mockComplete.mockResolvedValue({ content: 'bad json' });
    const res = await callJSON(model, 'p', { repairAttempts: 1 });
    expect(res.data).toBeUndefined();
    expect(res.error).toBeTruthy();
    expect(res.raw).toBe('bad json');
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it('repairAttempts 为 0 时不重试', async () => {
    mockComplete.mockResolvedValue({ content: 'bad' });
    const res = await callJSON(model, 'p', { repairAttempts: 0 });
    expect(res.error).toBeTruthy();
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it('validate 不通过触发修复，最终失败返回校验错误', async () => {
    mockComplete.mockResolvedValue({ content: '{"a":1}' });
    const res = await callJSON<{ b: number }>(model, 'p', {
      validate: (v): v is { b: number } => !!v && typeof v === 'object' && 'b' in (v as object),
    });
    expect(res.data).toBeUndefined();
    expect(res.error).toBeTruthy();
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it('validate 通过时返回数据', async () => {
    mockComplete.mockResolvedValue({ content: '{"b":7}' });
    const res = await callJSON<{ b: number }>(model, 'p', {
      validate: (v): v is { b: number } => !!v && typeof v === 'object' && 'b' in (v as object),
    });
    expect(res.data).toEqual({ b: 7 });
  });

  it('适配器错误直接透传且不重试', async () => {
    mockComplete.mockResolvedValue({ content: '', error: 'network down' });
    const res = await callJSON(model, 'p');
    expect(res.raw).toBe('');
    expect(res.error).toBe('network down');
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });
});
