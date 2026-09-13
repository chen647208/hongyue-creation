/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * AI 网关类型化客户端（docs/design/05 §7：渲染层只留类型化客户端）。
 *
 * 契约与旧进程内适配器完全一致：complete/stream 不抛错，失败经
 * AIResponse.error / 最终 onChunk 块返回。AbortSignal 在本地监听并转换为
 * abort 通道调用（信号对象不跨进程）；流式事件按 requestId 多路分发。
 */
import type { AiCallOptions, AIResponse, AiStreamEvent, ModelConfig, StreamingCallback } from '@shared/types';

import { i18n } from '@/i18n';

import { assertAiAllowed } from './aiGate';
import { recordUsage } from './usageTracker';

/** 流式空闲超时：超过该时长没有任何事件即判失败，避免丢事件导致悬挂。 */
const STREAM_IDLE_MS = 60_000;

/** 渲染端调用选项：线上选项 + 本地取消信号 + 功能归因。 */
export interface CallOptions extends AiCallOptions {
  signal?: AbortSignal;
  /** 用量按功能归因（如 'assistant' / 'consistency'）。 */
  feature?: string;
}

type Gateway = NonNullable<Window['electronAPI']>['aiGateway'];

function api(): Gateway {
  const gateway = window.electronAPI?.aiGateway;
  if (!gateway) {
    throw new Error(i18n.t('errors:requestFailedGeneric', { message: 'electronAPI.aiGateway unavailable' }));
  }
  return gateway;
}

let seq = 0;
function nextRequestId(): string {
  seq += 1;
  return `ai-${Date.now().toString(36)}-${seq.toString(36)}`;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function cancelledResponse(): AIResponse {
  return { content: '', error: i18n.t('errors:streamCancelled') };
}

function failureResponse(error: unknown): AIResponse {
  return {
    content: '',
    error: isAbort(error)
      ? i18n.t('errors:streamCancelled')
      : i18n.t('errors:requestFailedGeneric', { message: error instanceof Error ? error.message : String(error) }),
  };
}

/** 一次性补全（主进程执行，含重试）。错误经 AIResponse.error 返回，不抛出。 */
export async function gatewayComplete(model: ModelConfig, prompt: string, options?: CallOptions): Promise<AIResponse> {
  try {
    assertAiAllowed();
  } catch (error) {
    return failureResponse(error);
  }
  const requestId = nextRequestId();
  const gateway = api();
  const onAbort = (): void => {
    void gateway.abort(requestId);
  };
  options?.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (options?.signal?.aborted) return cancelledResponse();
    const response = await gateway.complete(requestId, model, prompt, { retries: options?.retries, images: options?.images });
    if (!response.error && response.tokens) {
      recordUsage({
        modelId: model.id,
        modelName: model.name,
        feature: options?.feature,
        prompt: response.tokens.prompt ?? 0,
        completion: response.tokens.completion ?? 0,
        cacheRead: response.tokens.cacheRead,
        cacheWrite: response.tokens.cacheWrite,
        at: Date.now(),
      });
    }
    return response;
  } catch (error) {
    return failureResponse(error);
  } finally {
    options?.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * 流式补全：onChunk 的 content 为累计值，完成时 isComplete=true。
 * 流式降级 notice（主进程判定）经最终块的 notice 字段透传，与旧契约一致。
 */
export async function gatewayStream(
  model: ModelConfig,
  prompt: string,
  onChunk: StreamingCallback,
  options?: CallOptions,
): Promise<void> {
  try {
    assertAiAllowed();
  } catch (error) {
    onChunk({ ...failureResponse(error), isComplete: true, isStreaming: false });
    return;
  }
  const requestId = nextRequestId();
  let gateway: Gateway;
  try {
    gateway = api();
  } catch (error) {
    onChunk({ ...failureResponse(error), isComplete: true, isStreaming: false });
    return;
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const armIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (settled) return;
        onChunk({ content: '', error: 'stream-idle-timeout', isComplete: true, isStreaming: false });
        void gateway.abort(requestId);
        finish();
      }, STREAM_IDLE_MS);
    };
    const finish = (): void => {
      if (!settled) {
        settled = true;
        if (idleTimer) clearTimeout(idleTimer);
        off();
        options?.signal?.removeEventListener('abort', onAbort);
        resolve();
      }
    };

    const onAbort = (): void => {
      void gateway.abort(requestId);
    };
    options?.signal?.addEventListener('abort', onAbort, { once: true });

    const off = gateway.onStreamEvent((event: AiStreamEvent) => {
      if (event.requestId !== requestId) return;
      armIdle();
      if (event.t === 'delta') {
        onChunk({
          content: event.accumulated,
          model: event.model,
          tokens: event.tokens,
          isComplete: false,
          isStreaming: true,
        });
      } else if (event.t === 'done') {
        if (!event.response.error && event.response.tokens) {
          recordUsage({
            modelId: model.id,
            modelName: model.name,
            feature: options?.feature,
            prompt: event.response.tokens.prompt ?? 0,
            completion: event.response.tokens.completion ?? 0,
            cacheRead: event.response.tokens.cacheRead,
            cacheWrite: event.response.tokens.cacheWrite,
            at: Date.now(),
          });
        }
        onChunk(event.response);
        finish();
      } else {
        onChunk({ content: '', error: event.error, isComplete: true, isStreaming: false });
        finish();
      }
    });

    armIdle();
    void gateway.openStream(requestId, model, prompt, { retries: options?.retries }).catch((error: unknown) => {
      onChunk({ ...failureResponse(error), isComplete: true, isStreaming: false });
      finish();
    });
  });
}

/** 类型化客户端聚合出口。 */
export const aiGatewayClient = {
  complete: gatewayComplete,
  stream: gatewayStream,
} as const;
