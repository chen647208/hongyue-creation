/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 供应商与模型的拆分/投影（纯函数）。
 *
 * 落盘结构：providers（地址、凭证、模型列表缓存）+ models（模型名与参数，按 providerId 归属）。
 * 运行时投影：resolveModels 把供应商的协议/地址/凭证贴到每个模型上，供 UI 与网关直接使用。
 */
import type { ModelConfig, ModelProvider, ProviderConfig, ResolvedModelConfig } from './types.js';

const PROTOCOL_LABEL: Record<ModelProvider, string> = {
  'openai-chat': 'OpenAI 兼容',
  'openai-responses': 'OpenAI Responses',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  ollama: 'Ollama',
}

function providerName(provider: ModelProvider, presetId?: string): string {
  return presetId || PROTOCOL_LABEL[provider] || provider;
}

/** 去掉运行时贴上的供应商字段，得到可落盘的模型条目。 */
export function stripResolvedModel(model: ResolvedModelConfig | ModelConfig): ModelConfig {
  const rest = { ...model } as Record<string, unknown>;
  for (const key of ['provider', 'presetId', 'endpoint', 'apiKey', 'availableModels', 'modelsLastFetched', 'modelsFetchError']) {
    delete rest[key];
  }
  return rest as unknown as ModelConfig;
}

/** 运行时投影：模型 + 供应商协议、地址、凭证、模型列表。找不到供应商时保留模型本身。 */
export function resolveModels(providers: ProviderConfig[], models: ModelConfig[]): ResolvedModelConfig[] {
  const byId = new Map(providers.map((p) => [p.id, p]));
  return models.map((model) => {
    const provider = byId.get(model.providerId);
    if (!provider) return { ...model, provider: 'openai-chat' };
    return {
      ...model,
      provider: provider.provider,
      presetId: provider.presetId,
      endpoint: provider.endpoint,
      apiKey: provider.apiKey,
      availableModels: provider.availableModels,
    };
  });
}

/** 按供应商维度合并两个模型数组的运行时字段（设置页编辑供应商后重算投影）。 */
export function resolveModel(model: ModelConfig, providers: ProviderConfig[]): ResolvedModelConfig {
  return resolveModels(providers, [model])[0] as ResolvedModelConfig;
}

interface LegacyModel extends ModelConfig {
  provider?: ModelProvider;
  presetId?: string;
  endpoint?: string;
  apiKey?: string;
  availableModels?: string[];
  modelsLastFetched?: number;
  modelsFetchError?: string;
}

/**
 * 读取旧数据或新数据，统一成 providers + models。
 *
 * - 已有 providers：按 providerId 归属；缺失 providerId 的条目按协议/地址/凭证回填到同组供应商。
 * - 没有 providers（旧结构）：按「协议 + 预设 + 地址」聚合，凭证取组内首个非空值。
 */
export function normalizeProvidersAndModels(
  rawProviders: unknown,
  rawModels: unknown,
): { providers: ProviderConfig[]; models: ModelConfig[] } {
  const legacyModels = Array.isArray(rawModels) ? (rawModels as LegacyModel[]) : [];
  const inputProviders = Array.isArray(rawProviders) ? (rawProviders as ProviderConfig[]) : [];
  const providers: ProviderConfig[] = inputProviders.map((p) => ({ ...p }));
  const byId = new Map(providers.map((p) => [p.id, p]));

  // 旧结构：按协议 + 预设 + 地址聚合；同一地址的多个模型共享一份凭证。
  const legacyGroups = new Map<string, ProviderConfig>();
  for (const model of legacyModels) {
    if (model.providerId && byId.has(model.providerId)) continue;
    if (model.providerId && !model.provider && !model.endpoint) continue;
    const key = `${model.provider ?? 'openai-chat'}|${model.presetId ?? ''}|${model.endpoint ?? ''}`;
    let provider = legacyGroups.get(key);
    if (!provider) {
      provider = {
        id: `provider-${legacyGroups.size + 1}`,
        name: providerName(model.provider ?? 'openai-chat', model.presetId),
        provider: model.provider ?? 'openai-chat',
        presetId: model.presetId,
        endpoint: model.endpoint,
        apiKey: model.apiKey,
        availableModels: model.availableModels,
        modelsLastFetched: model.modelsLastFetched,
        modelsFetchError: model.modelsFetchError,
      };
      legacyGroups.set(key, provider);
      providers.push(provider);
      byId.set(provider.id, provider);
    } else {
      if (!provider.apiKey && model.apiKey) provider.apiKey = model.apiKey;
      if (!provider.availableModels?.length && model.availableModels?.length) provider.availableModels = model.availableModels;
    }
  }

  const models: ModelConfig[] = legacyModels.map((model) => {
    let providerId = model.providerId;
    if (!providerId || !byId.has(providerId)) {
      const key = `${model.provider ?? 'openai-chat'}|${model.presetId ?? ''}|${model.endpoint ?? ''}`;
      providerId = legacyGroups.get(key)?.id ?? providers[0]?.id ?? '';
    }
    // 结构损坏（模型有 providerId 但供应商缺失）：补一个占位供应商，绝不丢模型
    if (!providerId) {
      const placeholder: ProviderConfig = {
        id: `provider-recovered-${providers.length + 1}`,
        name: providerName(model.provider ?? 'openai-chat', model.presetId),
        provider: model.provider ?? 'openai-chat',
        endpoint: model.endpoint,
        apiKey: model.apiKey,
      };
      providers.push(placeholder);
      byId.set(placeholder.id, placeholder);
      providerId = placeholder.id;
    }
    return { ...stripResolvedModel(model), providerId };
  });

  return { providers, models: models.filter((m) => m.providerId) };
}
