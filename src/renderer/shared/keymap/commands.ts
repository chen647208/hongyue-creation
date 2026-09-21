/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 快捷键命令目录与默认绑定（纯数据，无 DOM 依赖）。 */

import type { KeybindingActionId, KeybindingCategory, KeybindingCommand, KeybindingMap } from './types';

/**
 * 命令目录（展示顺序即设置页顺序）。默认绑定与历史硬编码一致：
 * 未配置时按键行为不变。
 */
export const KEYBINDING_COMMANDS: readonly KeybindingCommand[] = [
  { id: 'commandPalette', category: 'general', defaultBinding: 'Ctrl+K' },
  { id: 'toggleAssistant', category: 'general', defaultBinding: 'Ctrl+J' },
  { id: 'find', category: 'general', defaultBinding: 'Ctrl+F' },
  { id: 'globalSearch', category: 'general', defaultBinding: 'Ctrl+Shift+F' },
  { id: 'openSettings', category: 'general', defaultBinding: 'Ctrl+,' },
  { id: 'section1', category: 'navigation', defaultBinding: 'Ctrl+1' },
  { id: 'section2', category: 'navigation', defaultBinding: 'Ctrl+2' },
  { id: 'section3', category: 'navigation', defaultBinding: 'Ctrl+3' },
  { id: 'section4', category: 'navigation', defaultBinding: 'Ctrl+4' },
  { id: 'section5', category: 'navigation', defaultBinding: 'Ctrl+5' },
  { id: 'zoomIn', category: 'view', defaultBinding: 'Ctrl+=' },
  { id: 'zoomOut', category: 'view', defaultBinding: 'Ctrl+-' },
  { id: 'zoomReset', category: 'view', defaultBinding: 'Ctrl+0' },
] as const;

/** 全部命令 id（顺序与目录一致）。 */
export const KEYBINDING_ACTION_IDS: readonly KeybindingActionId[] = KEYBINDING_COMMANDS.map((c) => c.id);

/** 目录分组顺序与标题键。 */
export const KEYBINDING_CATEGORIES: readonly KeybindingCategory[] = ['general', 'navigation', 'view'];

/** 默认绑定表（由目录派生，单一来源）。 */
export const DEFAULT_KEYBINDINGS: Record<KeybindingActionId, string> = KEYBINDING_COMMANDS.reduce(
  (acc, command) => {
    acc[command.id] = command.defaultBinding;
    return acc;
  },
  {} as Record<KeybindingActionId, string>
);

const ACTION_ID_SET: ReadonlySet<string> = new Set(KEYBINDING_ACTION_IDS);

/** 字符串是否为合法命令 id（反序列化时过滤脏数据）。 */
export function isKeybindingActionId(value: string): value is KeybindingActionId {
  return ACTION_ID_SET.has(value);
}

/** 合并用户覆盖与默认（缺席回退默认）。 */
export function resolveKeybindings(custom?: KeybindingMap): Record<KeybindingActionId, string> {
  return { ...DEFAULT_KEYBINDINGS, ...custom };
}

/** 目录按分组切分，供设置页分组渲染。 */
export function groupKeybindingCommands(): Array<{ category: KeybindingCategory; commands: KeybindingCommand[] }> {
  return KEYBINDING_CATEGORIES.map((category) => ({
    category,
    commands: KEYBINDING_COMMANDS.filter((command) => command.category === category),
  })).filter((group) => group.commands.length > 0);
}
