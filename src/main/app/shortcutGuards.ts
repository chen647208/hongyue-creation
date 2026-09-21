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

/**
 * 禁用捏合缩放：把可视缩放锁定为 1，浏览器式缩放因子不再随手势变化。
 * 应用内缩放改由设置中的界面字号（`uiFontSize`）承担，渲染层拦截 Ctrl/Cmd+滚轮。
 */
export function installZoomGuard(contents: WebContents): void {
  void contents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
}

/**
 * 最小应用菜单：仅保留应用/编辑/窗口角色，去掉「视图/刷新/缩放/开发者工具」入口。
 * 开发运行额外保留开发者工具开关；缩放加速键不注册，键盘缩放交由应用自身接管。
 */
export function buildMinimalMenu(options?: { devtools?: boolean }): Menu {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  if (options?.devtools) {
    template.push({ role: 'toggleDevTools' });
  }
  return Menu.buildFromTemplate(template);
}
