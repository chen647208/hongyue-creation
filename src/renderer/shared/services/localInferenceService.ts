/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 本地推理接入（渲染端）：包装主进程 IPC，并给出「本地优先、不可达回落远程」决策。
 * 关闭或不可达时返回远程目标，既有远程网关契约不变。
 */
import { type InferenceTarget, inferLocalFlavor, localModelConfig, resolveInferenceTarget } from '@core/ai';
import type { LocalProbeResult, LocalRuntimeConfig, LocalRuntimeStatus, ModelConfig } from '@shared/types';

function api(): NonNullable<Window['electronAPI']>['localInference'] | undefined {
  return typeof window === 'undefined' ? undefined : window.electronAPI?.localInference;
}

export async function getLocalInferenceConfig(): Promise<LocalRuntimeConfig> {
  return (await api()?.getConfig()) ?? { enabled: false, endpoint: '' };
}

export async function setLocalInferenceConfig(config: LocalRuntimeConfig): Promise<void> {
  await api()?.setConfig(config);
}

export async function getLocalRuntimeStatus(): Promise<LocalRuntimeStatus> {
  return (await api()?.status()) ?? { running: false };
}

export async function probeLocalInference(): Promise<LocalProbeResult> {
  return (
    (await api()?.probe()) ?? { reachable: false, endpoint: '', flavor: 'openai', models: [], error: '当前环境不支持本地推理' }
  );
}

export async function startLocalRuntime(): Promise<LocalRuntimeStatus> {
  const result = await api()?.start();
  // 运行时启停后探测结果不再可信，生成路径下次重新判定
  resetLocalInferenceProbeCache();
  return result ?? { running: false };
}

export async function stopLocalRuntime(): Promise<void> {
  await api()?.stop();
  resetLocalInferenceProbeCache();
}

/**
 * 结合最近探测结果选择推理目标：本地可用走本地，否则回落远程。
 * `localAvailable` 由调用方持有（探测结果并入设置面板状态）。
 */
export function decideInferenceTarget(config: LocalRuntimeConfig, localAvailable: boolean): InferenceTarget {
  return resolveInferenceTarget({ local: config, localAvailable });
}

/** 探测结果短时缓存：生成路径每次调用都能判目标，但不必每轮都重新探测端点。 */
const PROBE_TTL_MS = 10_000;
let probeCache: { at: number; reachable: boolean } | null = null;

async function probeAvailability(): Promise<boolean> {
  const now = Date.now();
  if (probeCache && now - probeCache.at <= PROBE_TTL_MS) return probeCache.reachable;
  const probe = await probeLocalInference();
  probeCache = { at: now, reachable: probe.reachable };
  return probe.reachable;
}

/** 清空探测缓存（用户改配置/手动探测后调用，避免路由判断滞后）。 */
export function resetLocalInferenceProbeCache(): void {
  probeCache = null;
}

/**
 * 实际生成路径的模型选择：本地启用且探测可达时返回本地 ModelConfig，
 * 否则原样回落远程模型（远程模型契约不变）。两者都不可用返回 null。
 */
export async function resolveEffectiveModel(remoteModel?: ModelConfig | null): Promise<ModelConfig | null> {
  try {
    const config = await getLocalInferenceConfig();
    if (config.enabled) {
      const target = decideInferenceTarget(config, await probeAvailability());
      if (target.kind === 'local') {
        return localModelConfig(config, inferLocalFlavor(target.endpoint)) ?? remoteModel ?? null;
      }
    }
  } catch {
    // 探测/配置读取失败即回落远程
  }
  return remoteModel ?? null;
}
