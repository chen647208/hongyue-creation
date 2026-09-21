/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 快捷键系统出口：命令目录、纯函数、运行时 store 与 React 接线。 */

export {
  deserializeKeybindings,
  eventToBinding,
  findConflicts,
  formatBinding,
  isReservedBinding,
  matchEvent,
  normalizeBinding,
  parseBinding,
  serializeBinding,
  serializeKeybindings,
} from './bindings';
export {
  DEFAULT_KEYBINDINGS,
  groupKeybindingCommands,
  isKeybindingActionId,
  KEYBINDING_ACTION_IDS,
  KEYBINDING_CATEGORIES,
  KEYBINDING_COMMANDS,
  resolveKeybindings,
} from './commands';
export { type KeymapHandlers, useGlobalKeymap, useResolvedKeybindings } from './hooks';
export { useKeymapStore } from './store';
export type {
  KeybindingActionId,
  KeybindingCategory,
  KeybindingCommand,
  KeybindingMap,
  KeyEventLike,
  ParsedBinding,
} from './types';
