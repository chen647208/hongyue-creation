/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import {
  MIN_TOUCH_TARGET_PX,
  MOBILE_MAX_WIDTH,
  resolveViewportTier,
  resolveWorkspaceChrome,
} from '../../shared/utils/layout';

describe('resolveViewportTier', () => {
  it('手机宽度（360–430px）归为 mobile', () => {
    expect(resolveViewportTier(360)).toBe('mobile');
    expect(resolveViewportTier(430)).toBe('mobile');
    expect(resolveViewportTier(MOBILE_MAX_WIDTH)).toBe('mobile');
  });

  it('越过手机阈值进入 tablet，再进入 desktop', () => {
    expect(resolveViewportTier(MOBILE_MAX_WIDTH + 1)).toBe('tablet');
    expect(resolveViewportTier(1023)).toBe('tablet');
    expect(resolveViewportTier(1024)).toBe('desktop');
  });

  it('零宽与非法宽度按 desktop（测试/无窗口环境不塌缩）', () => {
    expect(resolveViewportTier(0)).toBe('desktop');
    expect(resolveViewportTier(-1)).toBe('desktop');
    expect(resolveViewportTier(Number.NaN)).toBe('desktop');
  });
});

describe('resolveWorkspaceChrome', () => {
  it('手机：底栏导航 + 全屏助手 + 抽屉写作侧栏 + 收起顶栏', () => {
    expect(resolveWorkspaceChrome('mobile')).toEqual({
      compactTopbar: true,
      bottomNav: true,
      assistantOverlay: true,
      writingSidebarOverlay: true,
      minTouchTarget: MIN_TOUCH_TARGET_PX,
    });
  });

  it('平板：不落底栏，写作侧栏仍并排，仅顶栏收起', () => {
    const plan = resolveWorkspaceChrome('tablet');
    expect(plan.bottomNav).toBe(false);
    expect(plan.assistantOverlay).toBe(false);
    expect(plan.writingSidebarOverlay).toBe(false);
    expect(plan.compactTopbar).toBe(true);
  });

  it('桌面：分栏布局，无覆盖层', () => {
    expect(resolveWorkspaceChrome('desktop')).toEqual({
      compactTopbar: false,
      bottomNav: false,
      assistantOverlay: false,
      writingSidebarOverlay: false,
      minTouchTarget: MIN_TOUCH_TARGET_PX,
    });
  });

  it('触控命中区不小于 44px', () => {
    expect(MIN_TOUCH_TARGET_PX).toBeGreaterThanOrEqual(44);
  });
});
