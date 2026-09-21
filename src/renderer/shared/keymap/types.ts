/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 快捷键系统类型：命令 id、绑定串、事件子集。 */

/**
 * 可自定义命令 id（固定集合）。新增命令同步改
 * `commands.ts` 目录、`App.tsx` 处理器与中英字典。
 */
export type KeybindingActionId =
  | 'commandPalette'
  | 'toggleAssistant'
  | 'find'
  | 'globalSearch'
  | 'openSettings'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'section1'
  | 'section2'
  | 'section3'
  | 'section4'
  | 'section5';

/** 用户覆盖表：只存改过默认值的命令；缺席回退默认。 */
export type KeybindingMap = Partial<Record<KeybindingActionId, string>>;

/** 命令分组（设置页按组展示）。 */
export type KeybindingCategory = 'general' | 'navigation' | 'view';

/** 命令目录条目。 */
export interface KeybindingCommand {
  id: KeybindingActionId;
  category: KeybindingCategory;
  /** 规范绑定串，例如 `Ctrl+Shift+K`、`Ctrl+=`。 */
  defaultBinding: string;
}

/** 键盘事件子集（KeyboardEvent 的结构子集，便于纯函数单测）。 */
export interface KeyEventLike {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
}

/** 解析后的绑定：`ctrl` 表示主修饰键（mac 为 Cmd）。 */
export interface ParsedBinding {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}
