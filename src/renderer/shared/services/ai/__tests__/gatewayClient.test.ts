/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * AI 网关渲染端契约：complete/stream 不抛错、失败经返回值、用量记账、
 * AbortSignal 转 abort 通道、按 requestId 过滤事件。
 */
import type { AiStreamEvent, ModelConfig } from '@shared/types';
import { beforeEach,describe, expect, it, vi } from 'vitest';

const usage = vi.hoisted(() => ({ recordUsage: vi.fn() }));
vi.mock('../usageTracker', () => ({ recordUsage: usage.recordUsage }));

import { gatewayComplete,gatewayStream } from '../gatewayClient';

type Listener = (event: AiStreamEvent) => void;

const model = (over: Partial<ModelConfig> = {}): ModelConfig =>
  ({ id: 'm', name: 'M', providerId: 'p', provider: 'openai-chat', modelName: 'x', ...over });

let listener: Listener | null = null;
const gateway = {
  complete: vi.fn(),
  openStream: vi.fn(),
  abort: vi.fn().mockResolvedValue(true),
  onStreamEvent: vi.fn((l: Listener) => {
    listener = l;
    return () => { listener = null; };
  }),
};

describe('aiGatewayClient 契约', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listener = null;
    vi.stubGlobal('window', { electronAPI: { aiGateway: gateway } });
  });

  it('complete 成功返回响应并记账用量', async () => {
    gateway.complete.mockResolvedValue({ content: 'ok', tokens: { prompt: 3, completion: 4 } });
    const res = await gatewayComplete(model(), 'p');
    expect(res.content).toBe('ok');
    expect(usage.recordUsage).toHaveBeenCalledTimes(1);
    expect(usage.recordUsage.mock.calls[0]?.[0]).toMatchObject({ modelId: 'm', prompt: 3, completion: 4 });
  });

  it('complete 失败转 AIResponse.error，不抛出、不记账', async () => {
    gateway.complete.mockRejectedValue(new Error('boom'));
    const res = await gatewayComplete(model(), 'p');
    expect(res.error).toContain('boom');
    expect(usage.recordUsage).not.toHaveBeenCalled();
  });

  it('stream：done 事件回传完成块并记账', async () => {
    gateway.openStream.mockResolvedValue(true);
    const chunks: Array<{ content: string; isComplete: boolean; error?: string }> = [];
    const done = gatewayStream(model(), 'p', (c) => chunks.push({ content: c.content, isComplete: c.isComplete, error: c.error }));
    await Promise.resolve();
    const requestId = gateway.openStream.mock.calls[0]?.[0] as string;
    listener?.({ t: 'done', requestId, response: { content: 'x', isComplete: true, tokens: { prompt: 1, completion: 2, total: 3 } } });
    await done;
    expect(chunks.at(-1)).toMatchObject({ content: 'x', isComplete: true });
    expect(usage.recordUsage).toHaveBeenCalledTimes(1);
  });

  it('stream：error 事件回传错误并结束', async () => {
    gateway.openStream.mockResolvedValue(true);
    const chunks: Array<{ isComplete: boolean; error?: string }> = [];
    const done = gatewayStream(model(), 'p', (c) => chunks.push({ isComplete: c.isComplete, error: c.error }));
    await Promise.resolve();
    const requestId = gateway.openStream.mock.calls[0]?.[0] as string;
    listener?.({ t: 'error', requestId, error: 'nope' });
    await done;
    expect(chunks.at(-1)).toMatchObject({ isComplete: true, error: 'nope' });
  });

  it('stream：AbortSignal 触发 abort 通道', async () => {
    gateway.openStream.mockResolvedValue(true);
    const controller = new AbortController();
    const done = gatewayStream(model(), 'p', () => undefined, { signal: controller.signal });
    await Promise.resolve();
    const requestId = gateway.openStream.mock.calls[0]?.[0] as string;
    controller.abort();
    expect(gateway.abort).toHaveBeenCalledWith(requestId);
    listener?.({ t: 'error', requestId, error: 'aborted' });
    await done;
  });
});
