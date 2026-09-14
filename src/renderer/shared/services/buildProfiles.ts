/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 构建档注册表单源（内置 + 插件贡献 + 用户保存的编译档案）。
 * 导出预设列表、插件装配（aiRuntime → bootstrapPlugins）共用此实例；
 * 类型为 core/build 单源 BuildProfile（见 design/18 §五 已统一）。
 * 用户档案存 localStorage（安装级偏好），存档与取档走 validateProfile 校验。
 */
import { type BuildProfile,COMPENDIUM_BUILD_PROFILE, DEFAULT_BUILD_PROFILE, MANUSCRIPT_BUILD_PROFILE } from '@core/build';
import { buildProfileKey,BuildProfileRegistry } from '@core/plugin';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';

import { localStore } from './localStore';

export const buildProfileRegistry = new BuildProfileRegistry();
buildProfileRegistry.register(DEFAULT_BUILD_PROFILE);
buildProfileRegistry.register(COMPENDIUM_BUILD_PROFILE);
buildProfileRegistry.register(MANUSCRIPT_BUILD_PROFILE);

export const profileKey = buildProfileKey;

/** 读取本机保存的编译档案（损坏数据静默丢弃，不阻断启动）。 */
export function listUserProfiles(): BuildProfile[] {
  const raw = localStore.getItem(STORAGE_KEYS.buildUserProfiles);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is BuildProfile => {
      if (typeof item !== 'object' || item === null) return false;
      const p = item as Partial<BuildProfile>;
      return typeof p.id === 'string' && typeof p.name === 'string' && typeof p.format === 'string';
    });
  } catch {
    return [];
  }
}

function writeUserProfiles(profiles: BuildProfile[]): void {
  localStore.setItem(STORAGE_KEYS.buildUserProfiles, JSON.stringify(profiles));
}

/** 保存/覆盖用户档案（按 id upsert）并注册到运行期注册表。 */
export function saveUserProfile(profile: BuildProfile): void {
  const key = buildProfileKey(profile);
  const next = listUserProfiles().filter((p) => buildProfileKey(p) !== key);
  next.push(profile);
  writeUserProfiles(next);
  buildProfileRegistry.register(profile);
}

/** 删除用户档案并解绑注册表（内置档案不落盘，删除无效但不报错）。 */
export function deleteUserProfile(id: string): void {
  const next = listUserProfiles().filter((p) => buildProfileKey(p) !== id);
  writeUserProfiles(next);
  buildProfileRegistry.remove(id);
}

// 启动即把本机保存的编译档案注册进运行期清单，导出预设下拉随即可见。
for (const profile of listUserProfiles()) buildProfileRegistry.register(profile);
