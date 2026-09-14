/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 助手运行时注册（特性契约，app 层接线）：把助手能力暴露给设置等消费方。 */
import { pluginHostPromise, reloadPlugins, saveDisabledList } from '@/features/assistant/services/aiRuntime';
import {
  deleteUserSkill,
  importUserSkill,
  listBuiltinSkills,
  listUserSkills,
} from '@/features/assistant/services/userSkillsService';
import { setAssistantRuntime } from '@/shared/services/assistantRuntime';

export function registerAssistantRuntime(): void {
  setAssistantRuntime({
    pluginHostPromise,
    reloadPlugins,
    saveDisabledList,
    listUserSkills,
    listBuiltinSkills,
    importUserSkill,
    deleteUserSkill,
  });
}
