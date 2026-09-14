/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 视口分级与工作台形态单源（docs/design/35）。
 *
 * 手机宽度下单一内容列：分区导航落到底部横向栏，AI 与写作侧栏改全屏/抽屉覆盖，
 * 顶栏收起次要入口。表格、时间线等固有横滚不受此限。
 * 纯函数，供 hook 与测试共用；阈值只在本文件改动。
 */

/** 手机档上限（含）：约 360–430px 机型与折叠屏外屏。 */
export const MOBILE_MAX_WIDTH = 639;
/** 平板档上限（含）。 */
export const TABLET_MAX_WIDTH = 1023;
/** 触控命中区最小边长（px），对应设计稿 44px 要求。 */
export const MIN_TOUCH_TARGET_PX = 44;

export type ViewportTier = 'mobile' | 'tablet' | 'desktop';

export interface WorkspaceChromePlan {
  /** 顶栏只保留核心入口。 */
  compactTopbar: boolean;
  /** 分区导航改为底部横向栏。 */
  bottomNav: boolean;
  /** AI 侧栏改为全屏覆盖层，而非与正文并排的分栏。 */
  assistantOverlay: boolean;
  /** 写作侧栏改为抽屉覆盖层。 */
  writingSidebarOverlay: boolean;
  /** 触控命中区最小边长（px）。 */
  minTouchTarget: number;
}

/** 视口宽度归一为分级；非法/零宽度按桌面处理。 */
export function resolveViewportTier(width: number): ViewportTier {
  if (!Number.isFinite(width) || width <= 0) return 'desktop';
  if (width <= MOBILE_MAX_WIDTH) return 'mobile';
  if (width <= TABLET_MAX_WIDTH) return 'tablet';
  return 'desktop';
}

/** 分级 → 工作台形态。 */
export function resolveWorkspaceChrome(tier: ViewportTier): WorkspaceChromePlan {
  const mobile = tier === 'mobile';
  const tablet = tier === 'tablet';
  return {
    compactTopbar: mobile || tablet,
    bottomNav: mobile,
    assistantOverlay: mobile,
    writingSidebarOverlay: mobile,
    minTouchTarget: MIN_TOUCH_TARGET_PX,
  };
}
