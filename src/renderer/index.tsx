/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */


import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './app/App';
import { registerServiceWorker } from './app/registerServiceWorker';
import { bootstrapI18n } from './i18n';
import ErrorBoundary from './shared/components/ErrorBoundary';
import { MIN_TOUCH_TARGET_PX } from './shared/utils/layout';
import { logger } from './shared/utils/logger';

// 渲染进程兜底：未捕获异常与未处理 Promise 记入日志，避免静默丢失现场
window.addEventListener('unhandledrejection', (event) => {
  logger.error('[renderer] Unhandled rejection', event.reason);
});
window.addEventListener('error', (event) => {
  logger.error('[renderer] Uncaught error', event.error ?? event.message);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

async function main(): Promise<void> {
  // 命中区常量单源：样式表统一经 --min-touch-target 取用，避免各处散落 44。
  document.documentElement.style.setProperty('--min-touch-target', `${MIN_TOUCH_TARGET_PX}px`);
  // 先初始化 i18n（检测初始语言），再首帧渲染，避免未翻译内容闪烁。
  await bootstrapI18n();
  registerServiceWorker();
  root.render(
    <React.StrictMode>
      {/* 根边界即应用整体：不传 scope，回落到 errorBoundary.appError 文案 */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

void main();



