/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 本地推理接入层（docs/design/40 §5）：端点规范化、模型列举解析、回落决策。
 *
 * 纯函数层，不启动进程、不发请求；进程管理与探测在主进程（`main/ai/localRuntime.ts`）。
 * 约定：本地运行时暴露 OpenAI 兼容端点（`/v1/models`）或 Ollama 端点（`/api/tags`）；
 * 运行时本身不随包分发，只做接入。关闭或不可达即回落远程网关（远程模型契约不变）。
 */
import type {
  LocalModelInfo,
  LocalProbeResult,
  LocalRuntimeConfig,
  LocalRuntimeFlavor,
} from '../../shared/types.js';

export type { LocalModelInfo, LocalProbeResult, LocalRuntimeConfig, LocalRuntimeFlavor };

/** 去掉尾部斜杠；空串保持空串。 */
export function normalizeLocalEndpoint(endpoint: string): string {
  const trimmed = (endpoint ?? '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

/** 端点使用的协议风味：含 ollama 或默认 llama.cpp 端口 11434 视为 Ollama，否则 OpenAI 兼容。 */
export function inferLocalFlavor(endpoint: string): LocalRuntimeFlavor {
  const url = normalizeLocalEndpoint(endpoint).toLowerCase();
  if (url.includes('ollama') || url.includes('11434')) return 'ollama';
  return 'openai';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : [];
}

/**
 * 解析模型列表响应：
 * - openai：`{ data: [{ id, created, owned_by }] }`；
 * - ollama：`{ models: [{ name, model, size, details: { family }, modified_at }] }`。
 * 无可用条目返回空数组（调用方据此判定不可用）。
 */
export function parseLocalModels(payload: unknown, flavor: LocalRuntimeFlavor): LocalModelInfo[] {
  const root = asRecord(payload);
  if (flavor === 'ollama') {
    return asRecords(root.models)
      .map((m) => {
        const details = asRecord(m.details);
        const id = typeof m.name === 'string' && m.name ? m.name : typeof m.model === 'string' ? m.model : '';
        return {
          id,
          name: typeof m.name === 'string' ? m.name : undefined,
          sizeBytes: typeof m.size === 'number' ? m.size : undefined,
          family: typeof details.family === 'string' ? details.family : undefined,
          modifiedAt: typeof m.modified_at === 'string' ? m.modified_at : undefined,
        };
      })
      .filter((m) => m.id !== '');
  }
  return asRecords(root.data)
    .map((m) => ({
      id: typeof m.id === 'string' ? m.id : '',
      name: typeof m.id === 'string' ? m.id : undefined,
      modifiedAt: typeof m.created === 'number' ? new Date(m.created * 1000).toISOString() : undefined,
    }))
    .filter((m) => m.id !== '');
}

/** 探测地址：OpenAI 兼容走 `<endpoint>/models`，Ollama 走 `<endpoint>/api/tags`。 */
export function localModelsUrl(endpoint: string, flavor?: LocalRuntimeFlavor): string {
  const base = normalizeLocalEndpoint(endpoint);
  const kind = flavor ?? inferLocalFlavor(base);
  return kind === 'ollama' ? `${base}/api/tags` : `${base}/models`;
}

/** 用注入的 fetch 探测本地端点（主进程调用；测试注入假 fetch）。 */
export async function probeLocalEndpoint(
  endpoint: string,
  fetchFn: typeof fetch,
  timeoutMs = 3_000,
): Promise<LocalProbeResult> {
  const base = normalizeLocalEndpoint(endpoint);
  const flavor = inferLocalFlavor(base);
  if (!base) {
    return { reachable: false, endpoint: base, flavor, models: [], error: '未配置本地端点' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(localModelsUrl(base, flavor), { signal: controller.signal });
    if (!response.ok) {
      return { reachable: false, endpoint: base, flavor, models: [], error: `HTTP ${response.status}` };
    }
    const models = parseLocalModels(await response.json(), flavor);
    return { reachable: true, endpoint: base, flavor, models };
  } catch (error) {
    return { reachable: false, endpoint: base, flavor, models: [], error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export type InferenceTarget =
  | { kind: 'local'; endpoint: string; model?: string }
  | { kind: 'remote'; reason: string };

export interface InferenceDecisionInput {
  local: LocalRuntimeConfig;
  /** 最近一次探测是否可达且有可用模型。 */
  localAvailable: boolean;
  /** 用户指定的远程模型标识（仅用于说明，决策不改其契约）。 */
  remoteModel?: string;
}

/**
 * 选择推理目标：本地启用且探测可达时走本地，否则回落远程。
 * 只做决策，不修改远程网关契约；远程模型由既有选择逻辑继续持有。
 */
export function resolveInferenceTarget(input: InferenceDecisionInput): InferenceTarget {
  const { local, localAvailable } = input;
  if (!local.enabled) return { kind: 'remote', reason: '本地推理已关闭' };
  if (!local.endpoint.trim()) return { kind: 'remote', reason: '本地端点未配置' };
  if (!localAvailable) return { kind: 'remote', reason: '本地端点不可达' };
  return { kind: 'local', endpoint: normalizeLocalEndpoint(local.endpoint), model: local.model };
}
