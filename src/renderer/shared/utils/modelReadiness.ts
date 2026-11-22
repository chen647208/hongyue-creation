/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { ProviderConfig, ResolvedModelConfig } from '../../../shared/types';
import { findProviderPreset } from '../../constants/modelProviders';

/**
 * 判断一个模型是否“可直接用于生成”——不同提供方所需凭证不同：
 *   - gemini：走官方 API，必须有 apiKey；
 *   - ollama：本地服务，必须有 endpoint，无需 key；
 *   - openai-chat / openai-responses / anthropic：必须有 endpoint；
 *     官方渠道（preset 标记 official）额外要求 apiKey，自定义兼容协议可只给端点。
 *     preset 身份以 presetId 为准（含自定义渠道 id），缺失时按旧语义回落。
 *
 * 用于首启引导：默认模型对象虽存在，但未填凭证时不应放行到生成流程，
 * 而应引导用户去设置，避免直接吃到生硬的接口报错。
 */
export function isModelConfigured(model: ResolvedModelConfig | null | undefined): boolean {
  if (!model) return false;
  const hasEndpoint = Boolean(model.endpoint && model.endpoint.trim());
  const hasKey = Boolean(model.apiKey && model.apiKey.trim());
  const preset = model.presetId ? findProviderPreset(model.presetId) : undefined;
  // 官方性：有 preset 查表；无 preset 的历史数据按旧规则（有 id 即官方）回落
  const isOfficial = preset ? preset.official : Boolean(model.presetId);
  switch (model.provider) {
    case 'gemini':
      return hasKey;
    case 'ollama':
      return hasEndpoint;
    case 'openai-chat':
    case 'openai-responses':
    case 'anthropic':
      return hasEndpoint && (isOfficial ? hasKey : true);
    default:
      return false;
  }
}

/**
 * 可用 = 已启用 && 已配置。停用的渠道不参与 activeModel 兜底与生成守卫，
 * 与 Cherry Studio 的 provider.isEnabled 语义一致。
 * 类型谓词：返回 true 时调用方可直接把模型当 ModelConfig 用。
 */
export function isModelUsable(model: ResolvedModelConfig | null | undefined): model is ResolvedModelConfig {
  if (!model) return false;
  if (model.isEnabled === false) return false;
  return isModelConfigured(model);
}

/** 供应商是否已具备调用条件（地址/Key 按协议判定），用于测试连通与拉取模型列表。 */
export function isProviderConfigured(provider: ProviderConfig | null | undefined): boolean {
  if (!provider) return false;
  const hasEndpoint = Boolean(provider.endpoint && provider.endpoint.trim());
  const hasKey = Boolean(provider.apiKey && provider.apiKey.trim());
  const preset = provider.presetId ? findProviderPreset(provider.presetId) : undefined;
  const isOfficial = preset ? preset.official : Boolean(provider.presetId);
  switch (provider.provider) {
    case 'gemini':
      return hasKey;
    case 'ollama':
      return hasEndpoint;
    case 'openai-chat':
    case 'openai-responses':
    case 'anthropic':
      return hasEndpoint && (isOfficial ? hasKey : true);
    default:
      return false;
  }
}
