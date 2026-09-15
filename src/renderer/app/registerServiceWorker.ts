/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 离线壳注册（docs/design/35）：只在浏览器生产构建注册 service worker。
 * Electron（file:// 协议或存在 electronAPI 的桌面环境）不注册，避免与本地加载冲突。
 */
import { logger } from '@/shared/utils/logger';

export interface ServiceWorkerGate {
  /** 是否桌面 Electron 环境（存在 electronAPI）。 */
  isDesktop: boolean;
  /** 是否生产构建。 */
  isProd: boolean;
  /** 浏览器是否支持 service worker。 */
  hasServiceWorker: boolean;
  /** 当前页面协议（如 'https:' / 'file:'）。 */
  protocol: string;
}

/** 纯函数：判定是否应注册离线壳。 */
export function shouldRegisterServiceWorker(gate: ServiceWorkerGate): boolean {
  if (!gate.isProd || gate.isDesktop || !gate.hasServiceWorker) return false;
  return gate.protocol !== 'file:';
}

/** 在浏览器生产环境注册 sw.js；失败不阻断应用，仅记录。 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  const allowed = shouldRegisterServiceWorker({
    isDesktop: !!window.electronAPI,
    isProd: import.meta.env.PROD,
    hasServiceWorker: 'serviceWorker' in navigator,
    protocol: window.location.protocol,
  });
  if (!allowed) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
      logger.warn('[sw] 离线壳注册失败', error);
    });
  });
}
