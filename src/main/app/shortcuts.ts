/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 桌面端浏览器式快捷键判定（纯函数，无 Electron 依赖）。
 *
 * 打包运行时屏蔽 Chromium 默认的刷新/开发者工具/打印等快捷键：避免误操作、
 * 贴近原生软件观感，并把键盘空间留给应用自身快捷键。清单来源见
 * `shared/constants/browserShortcuts.ts`，渲染层键位录制复用同一份做保留位提示。
 */

import { BLOCKED_PLAIN_KEYS, BLOCKED_SHORTCUT_COMBOS } from '../../shared/constants/browserShortcuts.js';

/** before-input-event 的输入子集。 */
export interface ShortcutInput {
  type: string;
  key: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/** 是否属于要屏蔽的浏览器式快捷键。 */
export function isBlockedBrowserShortcut(input: ShortcutInput): boolean {
  if (input.type !== 'keyDown') return false;
  if (input.alt) return false;
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key.toUpperCase();
  if (input.control || input.meta) {
    return BLOCKED_SHORTCUT_COMBOS.some((combo) => combo.key === key && combo.shift === input.shift);
  }
  return BLOCKED_PLAIN_KEYS.has(key);
}
