/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { dt } from '@/i18n';

import type { ProviderConfig } from '../../../../shared/types';
import { findProviderPreset, type ModelProviderInfo } from '../../../constants/modelProviders';

/**
 * 反推一个供应商当前对应的渠道预设 id（用于渠道下拉的选中值）。
 * 优先用显式 presetId；缺失时按协议回落到语义最接近的渠道，
 * 保证任何历史/自定义配置都能在下拉里有一个合法选中项。
 * 例外：gemini 官方预设端点留空（走 SDK 默认），填了端点即视为自定义 Gemini 兼容。
 */
export function channelValueFor(provider: ProviderConfig): string {
  if (provider.presetId && findProviderPreset(provider.presetId)) return provider.presetId;
  switch (provider.provider) {
    case 'gemini':
      return provider.endpoint?.trim() ? 'custom-gemini' : 'gemini';
    case 'ollama':
      return 'ollama';
    case 'anthropic':
      return 'custom-anthropic';
    case 'openai-responses':
      return 'openai-responses';
    default:
      return 'custom-openai';
  }
}

/**
 * 计算「切换渠道」时对供应商的补丁：写入协议、presetId、预置端点、展示名与推荐模型清单。
 * - 官方渠道：端点预置、presetId 标记、availableModels=推荐模型。
 * - 自定义渠道：presetId 同样保留（身份即所选兼容协议，否则下拉回弹到官方项），
 *   端点清空交由用户填写、清除 availableModels。
 * 不触碰 apiKey 等用户既有配置；模型条目与模型名保持不变。
 */
export function channelPatch(preset: ModelProviderInfo, current: ProviderConfig): Partial<ProviderConfig> {
  // 用户改过名就保留；仍是上一个渠道默认名时跟随新渠道
  const previousName = current.presetId ? findProviderPreset(current.presetId)?.nameKey : undefined;
  const keepName = Boolean(current.name.trim()) && current.name !== (previousName ? dt(previousName) : '');
  return {
    name: keepName ? current.name : dt(preset.nameKey),
    provider: preset.protocol,
    presetId: preset.id,
    endpoint: preset.endpoint,
    modelsFetchError: undefined,
    availableModels: preset.recommendedModels.length > 0 ? [...preset.recommendedModels] : undefined,
  };
}

/** 渠道下拉的分组结构。labelKey 为 settings 命名空间下的 i18n 键，渲染时解析。 */
export type ChannelLabelKey = 'channel.domestic' | 'channel.international' | 'channel.local' | 'channel.custom';
export interface ChannelGroup {
  id: string;
  labelKey: ChannelLabelKey;
  items: ModelProviderInfo[];
}

/**
 * 按「自定义（兼容协议） / 国内官方 / 国际官方 / 本地」对预设渠道分组，供下拉渲染。
 * 自定义排最前：协议是第一选择（对标 new-api 先选通道类型、OpenCode 先配 provider 包），
 * 官方预设只是填好端点的快捷方式。
 */
export function channelGroups(presets: ModelProviderInfo[]): ChannelGroup[] {
  const groups: ChannelGroup[] = [
    { id: 'custom', labelKey: 'channel.custom', items: presets.filter((p) => !p.official) },
    { id: 'domestic', labelKey: 'channel.domestic', items: presets.filter((p) => p.official && p.isChinese) },
    { id: 'international', labelKey: 'channel.international', items: presets.filter((p) => p.official && !p.isChinese && p.protocol !== 'ollama') },
    { id: 'local', labelKey: 'channel.local', items: presets.filter((p) => p.protocol === 'ollama') },
  ];
  return groups.filter((g) => g.items.length > 0);
}
