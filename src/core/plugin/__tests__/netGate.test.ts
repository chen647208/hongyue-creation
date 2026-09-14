/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_NETWORK_POLICY, effectiveLimits, evaluateNetworkRequest, hostAllowed } from '../netGate.js';

describe('netGate（受控网络门：默认拒绝）', () => {
  it('未配置允许域名：拒绝全部', () => {
    const decision = evaluateNetworkRequest(DEFAULT_NETWORK_POLICY, { url: 'https://api.example.com/search' });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('默认拒绝');
  });

  it('https 白名单精确命中：放行', () => {
    const decision = evaluateNetworkRequest({ allowedHosts: ['api.example.com'] }, { url: 'https://api.example.com/search' });
    expect(decision).toMatchObject({ allowed: true, host: 'api.example.com', method: 'GET' });
  });

  it('通配子域命中，裸域不命中', () => {
    expect(hostAllowed('search.api.example.com', ['*.api.example.com'])).toBe(true);
    expect(hostAllowed('api.example.com', ['*.api.example.com'])).toBe(false);
  });

  it('非白名单域名：拒绝', () => {
    const decision = evaluateNetworkRequest({ allowedHosts: ['api.example.com'] }, { url: 'https://evil.example.com/' });
    expect(decision.allowed).toBe(false);
  });

  it('非 https 且非回环：拒绝', () => {
    const decision = evaluateNetworkRequest({ allowedHosts: ['example.com'] }, { url: 'http://example.com/' });
    expect(decision.allowed).toBe(false);
  });

  it('本机回环允许 http（本地推理端点）', () => {
    const decision = evaluateNetworkRequest({ allowedHosts: ['127.0.0.1', 'localhost'] }, { url: 'http://127.0.0.1:11434/api/tags' });
    expect(decision.allowed).toBe(true);
  });

  it('URL 携带凭据：拒绝', () => {
    const decision = evaluateNetworkRequest({ allowedHosts: ['example.com'] }, { url: 'https://user:pass@example.com/' });
    expect(decision.allowed).toBe(false);
  });

  it('方法不在允许集合：拒绝', () => {
    const decision = evaluateNetworkRequest({ allowedHosts: ['example.com'], allowedMethods: ['GET'] }, { url: 'https://example.com/', method: 'DELETE' });
    expect(decision.allowed).toBe(false);
  });

  it('非法 URL：拒绝', () => {
    const decision = evaluateNetworkRequest({ allowedHosts: ['example.com'] }, { url: 'not a url' });
    expect(decision.allowed).toBe(false);
  });

  it('缺省上限回落到默认值', () => {
    expect(effectiveLimits({ allowedHosts: [] })).toEqual({
      maxResponseBytes: DEFAULT_NETWORK_POLICY.maxResponseBytes,
      timeoutMs: DEFAULT_NETWORK_POLICY.timeoutMs,
    });
  });
});
