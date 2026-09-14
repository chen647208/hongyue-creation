/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 退出导出握手（docs/design/36 §5）：主进程 before-quit 请求渲染层按配置上传同步包，
 * 渲染层完成后回执；带超时兜底，避免网络卡死拖住退出。导出物来自渲染层（SQLite 在渲染层经 IPC 读），
 * 故由渲染层执行上传，主进程只负责时序。
 */
import { type BrowserWindow, ipcMain } from 'electron';

import { IPC } from '../channels.js';

export function requestExitExport(
  getWindow: () => BrowserWindow | null,
  timeoutMs = 10_000,
): Promise<void> {
  const win = getWindow();
  if (!win || win.isDestroyed()) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener(IPC.sync.exitExportDone, onDone);
      clearTimeout(timer);
      resolve();
    };
    const onDone = (): void => finish();
    ipcMain.on(IPC.sync.exitExportDone, onDone);
    const timer = setTimeout(finish, timeoutMs);
    win.webContents.send(IPC.sync.exitExportRequest);
  });
}
