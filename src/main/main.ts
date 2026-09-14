/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { app, crashReporter } from 'electron';

import { aiGatewayProvider } from './ai/gateway.js';
import { collabProvider } from './app/collab.js';
import { AppContainer, type ProviderContext } from './app/container.js';
import { crashSubmitUrl, readCrashReportingConfig } from './app/crashReportConfig.js';
import { legacyDataDir, migrateLegacyDataDir, shouldRunMigration, standardDataDir } from './app/dataDir.js';
import { requestRendererFlush } from './app/flushHandshake.js';
import {
  dialogProvider,
  fileProvider,
  mcpClientProvider,
  netProvider,
  shellProvider,
  sqliteProvider,
  syncProvider,
  updaterProvider,
  vectorProvider,
  windowProvider,
} from './app/providers.js';
import { secureStoreProvider } from './app/secureStore.js';
import { applySecurityHeaders } from './app/security.js';
import { setQuitting } from './app/tray.js';
import { getMainWindow } from './app/window.js';
import { logger } from './logger.js';
import { requestExitExport } from './sync/exitExport.js';

/**
 * 应用入口：装配 Provider 容器并按序启动（docs/design/02）。
 * 子系统实现见 src/main/app/providers.ts 与 src/main/ai/gateway.ts；此处只负责生命周期编排。
 */
const container = new AppContainer()
  .register(sqliteProvider)
  .register(vectorProvider)
  .register(fileProvider)
  .register(dialogProvider)
  .register(secureStoreProvider)
  .register(aiGatewayProvider)
  .register(mcpClientProvider)
  .register(netProvider)
  .register(collabProvider)
  .register(syncProvider)
  .register(shellProvider)
  .register(updaterProvider)
  .register(windowProvider);

const ctx: ProviderContext = { getMainWindow };

// Windows 任务栏据此归组与显示应用名（缺失时会显示为 Electron 并分开归组）
app.setAppUserModelId('com.hongyue.creation');

// 单实例锁：第二个实例不再启动，只把已有窗口还原并聚焦（避免多进程写同一 db/vault）。
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  const win = getMainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
});

let booted = false;
let shuttingDown = false;

// 主进程兜底：未捕获异常与未处理 Promise 一律记日志，不让进程静默崩溃
process.on('uncaughtException', (error) => {
  logger.error('main', 'Uncaught exception in main process', error);
});
process.on('unhandledRejection', (reason) => {
  logger.error('main', 'Unhandled rejection in main process', reason);
});

void app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  // 崩溃转储：本地留存；用户开启且配置了上报地址时才上传（转储仅落 userData，不外发）
  const crashConfig = readCrashReportingConfig();
  const submitURL = crashSubmitUrl();
  crashReporter.start({
    productName: '红月创作',
    uploadToServer: crashConfig.enabled && !!submitURL,
    submitURL,
    compress: true,
  });
  applySecurityHeaders();
  logger.info('app', `User data path: ${app.getPath('userData')}`);
  // 更名迁移：仅标准路径跑（--user-data-dir 隔离的测试/调试实例不碰真实数据）
  if (shouldRunMigration(app.getPath('userData'), standardDataDir())) {
    try {
      await migrateLegacyDataDir(legacyDataDir(), app.getPath('userData'));
    } catch (err) {
      logger.warn('datadir', '旧数据目录迁移失败（下次启动重试，不挡启动）', err);
    }
  }
  await container.boot(ctx);
  booted = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 退出时串行等待资源释放（关 SQLite、回收 MCP 子进程、中止 AI 流）后再真正退出，
// 超时兜底避免清理挂起导致进程无法结束。
app.on('before-quit', (event) => {
  setQuitting();
  if (!booted || shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  const timer = setTimeout(() => {
    logger.warn('app', 'shutdown timed out, forcing exit');
    app.exit(0);
  }, 12_000);
  // 先让渲染层把未落库的差分写回，再按其配置执行退出导出，最后释放主进程资源
  void requestRendererFlush(getMainWindow)
    .then(() => requestExitExport(getMainWindow))
    .then(() => container.shutdown(ctx))
    .catch((err) => logger.error('app', 'shutdown failed', err))
    .finally(() => {
      clearTimeout(timer);
      booted = false;
      app.quit();
    });
});
