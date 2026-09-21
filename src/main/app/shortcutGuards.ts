/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 浏览器式快捷键屏蔽与最小菜单的 Electron 接线（打包运行时启用）。
 * 判定逻辑在 `shortcuts.ts`（纯函数，可单测）。
 */
import { Menu, type MenuItemConstructorOptions, type WebContents } from 'electron';

import { isBlockedBrowserShortcut } from './shortcuts.js';

/** 在渲染内容上拦截浏览器式快捷键。 */
export function installBrowserShortcutGuards(contents: WebContents): void {
  contents.on('before-input-event', (event, input) => {
    if (isBlockedBrowserShortcut(input)) event.preventDefault();
  });
}

/** 最小应用菜单：仅保留应用/编辑/窗口角色，去掉「视图/刷新/开发者工具」入口。 */
export function buildMinimalMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  return Menu.buildFromTemplate(template);
}
