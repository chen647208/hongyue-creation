/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 诊断包导出 IPC：收集（见 diagnosticsCore）→ STORE zip → 另存为。
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { app, type BrowserWindow, dialog, ipcMain } from 'electron';

import { zipStore } from '../../core/build/zipStore.js';
import { IPC } from '../channels.js';
import { logger } from '../logger.js';
import { type AppInfo,collectDiagnostics } from './diagnosticsCore.js';

export function registerDiagnosticsIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.exportDiagnostics, async () => {
    const userData = app.getPath('userData');
    const appInfo: AppInfo = {
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    };
    const files = await collectDiagnostics(userData, appInfo);
    const zip = zipStore(files);
    const stamp = new Date().toISOString().slice(0, 10);
    const options = {
      title: '导出诊断包',
      defaultPath: `hongyue-diagnostics-${stamp}.zip`,
      filters: [{ name: 'Zip', extensions: ['zip'] }],
    };
    const parent = getMainWindow();
    const target = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (target.canceled || !target.filePath) return { canceled: true as const };
    await fs.mkdir(path.dirname(target.filePath), { recursive: true });
    await fs.writeFile(target.filePath, zip);
    logger.info('diagnostics', `诊断包已导出：${target.filePath}`);
    return { canceled: false as const, path: target.filePath };
  });
}
