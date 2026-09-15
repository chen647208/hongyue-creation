/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { shouldRegisterServiceWorker } from '../registerServiceWorker';

describe('shouldRegisterServiceWorker', () => {
  const base = { isDesktop: false, isProd: true, hasServiceWorker: true, protocol: 'https:' };

  it('浏览器生产环境注册', () => {
    expect(shouldRegisterServiceWorker(base)).toBe(true);
  });

  it('桌面 Electron 环境不注册', () => {
    expect(shouldRegisterServiceWorker({ ...base, isDesktop: true })).toBe(false);
  });

  it('开发环境不注册', () => {
    expect(shouldRegisterServiceWorker({ ...base, isProd: false })).toBe(false);
  });

  it('浏览器不支持 service worker 时不注册', () => {
    expect(shouldRegisterServiceWorker({ ...base, hasServiceWorker: false })).toBe(false);
  });

  it('file:// 协议不注册', () => {
    expect(shouldRegisterServiceWorker({ ...base, protocol: 'file:' })).toBe(false);
  });
});
