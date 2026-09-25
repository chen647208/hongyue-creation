/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { clampSandboxLimits, DEFAULT_SANDBOX_LIMITS } from '../sandbox.js';

describe('clampSandboxLimits（51 篇：限额只许下调）', () => {
  it('无入参返回默认限额', () => {
    expect(clampSandboxLimits()).toEqual(DEFAULT_SANDBOX_LIMITS);
  });

  it('低于上限的入参生效（允许下调）', () => {
    const limits = clampSandboxLimits({ timeoutMs: 100, memoryBytes: 1024, maxOutputBytes: 128 });
    expect(limits).toEqual({ timeoutMs: 100, memoryBytes: 1024, maxOutputBytes: 128 });
  });

  it('高于上限的入参被钳到上限', () => {
    const limits = clampSandboxLimits({ timeoutMs: 1e9, memoryBytes: Number.MAX_SAFE_INTEGER, maxOutputBytes: 1e12 });
    expect(limits).toEqual(DEFAULT_SANDBOX_LIMITS);
  });

  it('非法值（负数/NaN/非数字）回落上限', () => {
    expect(clampSandboxLimits({ timeoutMs: -5, memoryBytes: Number.NaN, maxOutputBytes: 'x' as unknown as number })).toEqual(
      DEFAULT_SANDBOX_LIMITS,
    );
  });
});
