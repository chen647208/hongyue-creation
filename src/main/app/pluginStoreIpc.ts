/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件安装/卸载 IPC（docs/design/40 §1）。主进程持信任公钥清单，安装前校验签名与来源。
 */
import { app, ipcMain } from 'electron';

import { IPC } from '../channels.js';
import { assertPathAllowed } from './fsAccess.js';
import { installPluginFromDirectory, listInstalledPlugins, uninstallInstalledPlugin } from './pluginStore.js';
import { isTrustedPluginKey } from './pluginTrust.js';

export interface PluginInstallIpcRequest {
  sourceDir: string;
  hostVersion: string;
  allowedSources?: string[];
  allowAnySource?: boolean;
  expectedDigest?: string;
  requireSignature?: boolean;
}

function pluginsRoot(): string {
  return `${app.getPath('userData')}/plugins`;
}

export function registerPluginStoreIpc(): void {
  ipcMain.handle(IPC.plugin.install, (_event, request: PluginInstallIpcRequest) => {
    if (typeof request !== 'object' || request === null || typeof request.sourceDir !== 'string') {
      throw new TypeError('Invalid plugin:install arguments');
    }
    // 源目录须经对话框授权（或位于 userData 内）；越界直接拒绝。
    assertPathAllowed(request.sourceDir);
    return installPluginFromDirectory(
      { pluginsRoot: pluginsRoot(), isTrustedKey: isTrustedPluginKey },
      request.sourceDir,
      {
        hostVersion: request.hostVersion,
        allowedSources: request.allowedSources,
        allowAnySource: request.allowAnySource,
        expectedDigest: request.expectedDigest,
        requireSignature: request.requireSignature,
      },
    );
  });

  ipcMain.handle(IPC.plugin.uninstall, (_event, pluginId: string) => {
    if (typeof pluginId !== 'string' || pluginId.length === 0) {
      throw new TypeError('Invalid plugin:uninstall arguments');
    }
    return uninstallInstalledPlugin({ pluginsRoot: pluginsRoot(), isTrustedKey: isTrustedPluginKey }, pluginId);
  });

  ipcMain.handle(IPC.plugin.list, () =>
    listInstalledPlugins({ pluginsRoot: pluginsRoot(), isTrustedKey: isTrustedPluginKey }));
}
