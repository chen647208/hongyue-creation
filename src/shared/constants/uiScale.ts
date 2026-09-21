/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 界面字号范围单一来源：设置页滑块与缩放快捷键共用，改值只改此处。
 * 单位 px；default 与 `settingsStore` 的最终兜底一致。
 */
export const UI_FONT_SIZE = {
  default: 14,
  min: 11,
  max: 20,
  step: 1,
} as const;

/** 把字号夹到可取值范围并取整。 */
export function clampUiFontSize(size: number): number {
  const rounded = Math.round(size);
  return Math.min(UI_FONT_SIZE.max, Math.max(UI_FONT_SIZE.min, rounded));
}
