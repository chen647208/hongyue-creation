/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 编译档案 YAML 编解码（.novel/builds/*.yml）。
 * 与 profile.ts 分文件：js-yaml 只在导入/分享档案时加载，启动与导出主路径不付这份体积。
 */
import { dump, load } from 'js-yaml';

import { type BuildProfile, readProfile, validateProfile } from './profile.js';

/** Profile → YAML 文本（.yml 分享单元）。 */
export function serializeProfileYaml(profile: BuildProfile): string {
  return dump(profile, { lineWidth: 120, noRefs: true });
}

/** YAML 文本 → Profile；结构校验失败抛错（导入 UI 捕获提示）。 */
export function parseProfileYaml(text: string): BuildProfile {
  const parsed = load(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Profile YAML 必须是对象');
  }
  const m = parsed as Record<string, unknown>;
  // 顶层键缺失给逐字段报错（用户直接可读）；类型窄化交给 readProfile。
  for (const key of ['name', 'format', 'selection', 'transform', 'render']) {
    if (!(key in m)) throw new Error(`Profile YAML 缺少字段：${key}`);
  }
  const profile = readProfile(m);
  if (profile === undefined) {
    throw new Error('Profile YAML 结构无效：必填字段缺失或类型不符');
  }
  const errors = validateProfile(profile);
  if (errors.length > 0) throw new Error(`编译档案无效：${errors.join('；')}`);
  return profile;
}
