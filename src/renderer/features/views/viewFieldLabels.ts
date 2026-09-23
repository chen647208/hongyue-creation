/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 扩展字段的标题表：`Project.extensions` 的自有键已是行字段，
 * 其显示标题取类型注册表（TypeRegistry）里字段声明的 label；未命中回落原始键。
 * 同名键被多个模板声明时取模板 id 最小的那条，保证同一份数据在任何视图中标题一致。
 */
import type { FieldDef, TypeTemplate } from '@core/types-registry';

/** 由模板清单生成「字段键 → 标题」表；未收录的键不进入表中。 */
export function buildTemplateFieldLabels(templates: readonly TypeTemplate[]): Map<string, string> {
  const labels = new Map<string, string>();
  const ordered = [...templates].sort((left, right) => left.id.localeCompare(right.id));
  for (const template of ordered) {
    for (const field of template.fields as readonly FieldDef[]) {
      if (!labels.has(field.key)) labels.set(field.key, field.label);
    }
  }
  return labels;
}
