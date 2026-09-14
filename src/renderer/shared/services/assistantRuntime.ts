/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 助手运行时契约（design/02 特性契约）：助手在 app 层注册运行时能力，
 * 设置等消费方经此访问，避免 feature→feature 直接 import。
 */
import type { PluginHost } from '@core/plugin';

export interface UserSkillInfo {
  /** 目录 slug（删除用） */
  slug: string;
  name: string;
  description: string;
}

export interface BuiltinSkillInfo {
  name: string;
  description: string;
}

export interface AssistantRuntimeContract {
  pluginHostPromise: Promise<PluginHost>;
  /** 安装/卸载后重建插件宿主（释放旧贡献 + 重新发现）。 */
  reloadPlugins: () => Promise<PluginHost>;
  saveDisabledList: (ids: string[]) => void;
  listUserSkills: () => Promise<UserSkillInfo[]>;
  listBuiltinSkills: () => BuiltinSkillInfo[];
  importUserSkill: (md: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  deleteUserSkill: (slug: string, name: string) => Promise<void>;
}

let impl: AssistantRuntimeContract | undefined;

export function setAssistantRuntime(value: AssistantRuntimeContract): void {
  impl = value;
}

export function assistantRuntime(): AssistantRuntimeContract | undefined {
  return impl;
}
