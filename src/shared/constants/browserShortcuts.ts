/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 浏览器式快捷键清单单一来源：主进程据此屏蔽，渲染层键位录制据此提示保留组合。
 *
 * `primary` 表示 Ctrl（mac 为 Cmd）。组合判定要求主修饰键命中且 `shift` 精确匹配，
 * 带 Alt 的组合一律放行。键名：单字符统一小写，功能键统一大写。
 */

/** 单键屏蔽：与平台修饰键无关的功能键。 */
export const BLOCKED_PLAIN_KEYS: ReadonlySet<string> = new Set(['F5', 'F12']);

/** 修饰键组合屏蔽项。 */
export interface BlockedShortcutCombo {
  key: string;
  shift: boolean;
}

export const BLOCKED_SHORTCUT_COMBOS: readonly BlockedShortcutCombo[] = [
  { key: 'r', shift: false }, // 刷新
  { key: 'r', shift: true }, // 强制刷新
  { key: 'i', shift: true }, // 开发者工具
  { key: 'j', shift: true }, // 控制台
  { key: 'c', shift: true }, // 检查元素
  { key: 'p', shift: false }, // 打印
];

/** 主修饰键+可选 Shift 是否命中浏览器保留组合。 */
export function isReservedBrowserShortcut(primary: boolean, shift: boolean, key: string): boolean {
  if (!primary) return false;
  const normalized = key.length === 1 ? key.toLowerCase() : key.toUpperCase();
  return BLOCKED_SHORTCUT_COMBOS.some((combo) => combo.key === normalized && combo.shift === shift);
}
