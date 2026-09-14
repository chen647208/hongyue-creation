/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  packaged: false,
  headersHandler: undefined as
    | ((details: { responseHeaders?: Record<string, string[]> }, callback: (r: { responseHeaders: Record<string, string[]> }) => void) => void)
    | undefined,
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged(): boolean {
      return state.packaged;
    },
  },
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: (
          handler: (details: { responseHeaders?: Record<string, string[]> }, callback: (r: { responseHeaders: Record<string, string[]> }) => void) => void,
        ): void => {
          state.headersHandler = handler;
        },
      },
    },
  },
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { applySecurityHeaders, CONTENT_SECURITY_POLICY } from '../security.js';

describe('applySecurityHeaders（打包版 CSP）', () => {
  beforeEach(() => {
    state.packaged = false;
    state.headersHandler = undefined;
  });

  it('开发版不注入响应头', () => {
    applySecurityHeaders();
    expect(state.headersHandler).toBeUndefined();
  });

  it('打包版注册头改写并合并已有响应头', () => {
    state.packaged = true;
    applySecurityHeaders();
    expect(state.headersHandler).toBeTypeOf('function');
    let captured: { responseHeaders: Record<string, string[]> } | undefined;
    state.headersHandler?.({ responseHeaders: { 'X-Test': ['1'] } }, (r) => {
      captured = r;
    });
    expect(captured?.responseHeaders['X-Test']).toEqual(['1']);
    expect(captured?.responseHeaders['Content-Security-Policy']).toEqual([CONTENT_SECURITY_POLICY]);
  });

  it('CSP 串包含关键指令', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self' https: http: ws: wss:");
  });
});
