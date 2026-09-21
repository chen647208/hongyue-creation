/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { useEffect } from 'react';

/**
 * 拦截 Ctrl/Cmd+滚轮缩放。主进程拿不到 wheel 事件，故在渲染层用非 passive 的
 * capture 监听阻止默认；捏合缩放在主进程由 `setVisualZoomLevelLimits(1, 1)` 关闭。
 * 应用内缩放改由界面字号设置承担。
 */
export function useZoomGuard(): void {
  useEffect(() => {
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, []);
}
