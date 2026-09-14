/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  resolveAdapter: vi.fn(),
  withVaultKey: vi.fn(),
  resolveVaultApiKey: vi.fn(),
  VAULT_UNAVAILABLE: 'vault-unavailable',
}));

vi.mock('electron', () => ({
  app: { getLocale: () => 'zh' },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any): void => {
      state.handlers.set(channel, fn);
    },
  },
}));

vi.mock('../i18n.js', () => ({ initAiI18n: vi.fn(async () => undefined), aiT: (key: string) => key }));

vi.mock('../resolve.js', () => ({ resolveAdapter: state.resolveAdapter }));

vi.mock('../../app/secureStore.js', () => ({
  withVaultKey: state.withVaultKey,
  resolveVaultApiKey: state.resolveVaultApiKey,
  VAULT_UNAVAILABLE: state.VAULT_UNAVAILABLE,
}));

import type { ModelConfig } from '../../../shared/types.js';
import { IPC } from '../../channels.js';

async function load() {
  return import('../gateway.js');
}

const model = (over: Partial<ModelConfig> = {}): ModelConfig => ({
  id: 'm1',
  name: 'T',
  provider: 'openai-chat',
  endpoint: 'https://x/v1',
  modelName: 'm',
  ...over,
});

function adapter(over: Record<string, unknown> = {}) {
  return {
    supportsStreaming: () => true,
    complete: vi.fn(async () => ({ content: 'done' })),
    stream: vi.fn(async () => undefined),
    ...over,
  };
}

function event() {
  return { sender: { isDestroyed: () => false, send: vi.fn(), once: vi.fn() } };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  state.handlers.clear();
  state.withVaultKey.mockReset().mockResolvedValue({ ok: true, model: model() });
  state.resolveVaultApiKey.mockReset().mockResolvedValue('sk-vault');
  state.resolveAdapter.mockReset().mockReturnValue(adapter());
});

describe('aiGatewayProvider（IPC 网关）', () => {
  it('boot 注册 complete/stream/abort/http 通道', async () => {
    const { aiGatewayProvider } = await load();
    await aiGatewayProvider.boot({ getMainWindow: () => null });
    for (const channel of [IPC.ai.complete, IPC.ai.streamOpen, IPC.ai.abort, IPC.ai.http]) {
      expect(state.handlers.has(channel)).toBe(true);
    }
  });

  it('complete 校验入参并透传模型与选项', async () => {
    const complete = vi.fn(async () => ({ content: 'hi' }));
    state.resolveAdapter.mockReturnValue(adapter({ complete }));
    const { aiGatewayProvider } = await load();
    await aiGatewayProvider.boot({ getMainWindow: () => null });
    const handler = state.handlers.get(IPC.ai.complete)!;

    await expect(handler(null, 5, model(), 'p')).rejects.toThrow(TypeError);
    await expect(handler(null, 'r1', undefined, 'p')).rejects.toThrow(TypeError);

    await expect(handler(null, 'r1', model(), 'prompt', { retries: 5, images: ['img'] })).resolves.toEqual({
      content: 'hi',
    });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1' }),
      'prompt',
      expect.objectContaining({ retries: 5, images: ['img'] }),
    );
  });

  it('complete 未给选项时默认重试 2 次', async () => {
    const complete = vi.fn(async () => ({ content: 'hi' }));
    state.resolveAdapter.mockReturnValue(adapter({ complete }));
    const { aiGatewayProvider } = await load();
    await aiGatewayProvider.boot({ getMainWindow: () => null });
    await state.handlers.get(IPC.ai.complete)!(null, 'r1', model(), 'p');
    expect(complete).toHaveBeenCalledWith(
      expect.anything(),
      'p',
      expect.objectContaining({ retries: 2, signal: expect.any(AbortSignal) }),
    );
  });

  it('complete 在 vault 解引用失败时抛出原因且不调用适配器', async () => {
    state.withVaultKey.mockResolvedValue({ ok: false, error: 'vault missing' });
    const { aiGatewayProvider } = await load();
    await aiGatewayProvider.boot({ getMainWindow: () => null });
    await expect(state.handlers.get(IPC.ai.complete)!(null, 'r1', model(), 'p')).rejects.toThrow('vault missing');
    expect(state.resolveAdapter).not.toHaveBeenCalled();
  });

  it('stream:open 校验入参，vault 失败推送 error 并返回 false', async () => {
    state.withVaultKey.mockResolvedValue({ ok: false, error: 'no key' });
    const { aiGatewayProvider } = await load();
    await aiGatewayProvider.boot({ getMainWindow: () => null });
    const open = state.handlers.get(IPC.ai.streamOpen)!;

    await expect(open(null, 5, model(), 'p')).rejects.toThrow(TypeError);

    const ev = event();
    await expect(open(ev, 'r1', model(), 'p')).resolves.toBe(false);
    expect(ev.sender.send).toHaveBeenCalledWith(IPC.ai.streamEvent, {
      t: 'error',
      requestId: 'r1',
      error: 'no key',
    });
  });

  it('stream:open 成功时推送 delta 与 done', async () => {
    const stream = vi.fn(async (_m: unknown, _p: unknown, onChunk: (chunk: Record<string, unknown>) => void) => {
      onChunk({ content: 'a', isComplete: false });
      onChunk({ content: 'b', isComplete: true, isStreaming: false });
    });
    state.resolveAdapter.mockReturnValue(adapter({ stream }));
    const { aiGatewayProvider } = await load();
    await aiGatewayProvider.boot({ getMainWindow: () => null });
    const ev = event();

    await expect(state.handlers.get(IPC.ai.streamOpen)!(ev, 'r1', model(), 'p')).resolves.toBe(true);
    await tick();
    expect(ev.sender.send).toHaveBeenCalledWith(
      IPC.ai.streamEvent,
      expect.objectContaining({ t: 'delta', requestId: 'r1', accumulated: 'a' }),
    );
    expect(ev.sender.send).toHaveBeenCalledWith(
      IPC.ai.streamEvent,
      expect.objectContaining({ t: 'done', requestId: 'r1' }),
    );
  });

  it('stream:open 适配器抛错时推送 error 事件', async () => {
    state.resolveAdapter.mockReturnValue(
      adapter({
        stream: vi.fn(async () => {
          throw new Error('stream boom');
        }),
      }),
    );
    const { aiGatewayProvider } = await load();
    await aiGatewayProvider.boot({ getMainWindow: () => null });
    const ev = event();

    await state.handlers.get(IPC.ai.streamOpen)!(ev, 'r1', model(), 'p');
    await tick();
    expect(ev.sender.send).toHaveBeenCalledWith(IPC.ai.streamEvent, {
      t: 'error',
      requestId: 'r1',
      error: 'stream boom',
    });
  });

  it('abort 中止在途请求，未知 requestId 仍返回 true', async () => {
    let signal: AbortSignal | undefined;
    const complete = vi.fn(
      (_m: unknown, _p: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options.signal;
          options.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    state.resolveAdapter.mockReturnValue(adapter({ complete }));
    const { aiGatewayProvider } = await load();
    await aiGatewayProvider.boot({ getMainWindow: () => null });
    const abort = state.handlers.get(IPC.ai.abort)!;

    const pending = state.handlers.get(IPC.ai.complete)!(null, 'r9', model(), 'p');
    await tick();
    expect(abort(null, 'r9')).toBe(true);
    await expect(pending).rejects.toThrow('aborted');
    expect(signal?.aborted).toBe(true);
    expect(abort(null, 'missing')).toBe(true);
  });

  it('shutdown 中止全部在途请求', async () => {
    const complete = vi.fn(
      (_m: unknown, _p: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('aborted by shutdown')));
        }),
    );
    state.resolveAdapter.mockReturnValue(adapter({ complete }));
    const { aiGatewayProvider } = await load();
    await aiGatewayProvider.boot({ getMainWindow: () => null });

    const pending = state.handlers.get(IPC.ai.complete)!(null, 'r9', model(), 'p');
    await tick();
    await aiGatewayProvider.shutdown?.({ getMainWindow: () => null });
    await expect(pending).rejects.toThrow('aborted by shutdown');
  });

  it('http 处理器执行受控请求，vault 引用注入与缺失分支', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'body',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { aiGatewayProvider, performAiHttp } = await load();
    await aiGatewayProvider.boot({ getMainWindow: () => null });

    await expect(state.handlers.get(IPC.ai.http)!(null, { url: 'https://x' })).resolves.toEqual({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: 'body',
    });

    await performAiHttp({ url: 'https://x', apiKeyRef: 'vault:m' });
    const headers = (fetchMock.mock.calls[1]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-vault');

    state.resolveVaultApiKey.mockResolvedValue(undefined);
    await expect(performAiHttp({ url: 'https://x', apiKeyRef: 'vault:missing' })).rejects.toThrow(
      state.VAULT_UNAVAILABLE,
    );

    await expect(performAiHttp(null as unknown as never)).rejects.toThrow(TypeError);
    vi.unstubAllGlobals();
  });
});
