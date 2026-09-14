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
import { type InferenceTarget, resolveInferenceTarget } from '@core/ai';
import type { LocalProbeResult, LocalRuntimeConfig, LocalRuntimeStatus } from '@shared/types';

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
  return result ?? { running: false };
}

export async function stopLocalRuntime(): Promise<void> {
  await api()?.stop();
}

/**
 * 结合最近探测结果选择推理目标：本地可用走本地，否则回落远程。
 * `localAvailable` 由调用方持有（探测结果并入设置面板状态）。
 */
export function decideInferenceTarget(config: LocalRuntimeConfig, localAvailable: boolean): InferenceTarget {
  return resolveInferenceTarget({ local: config, localAvailable });
}
