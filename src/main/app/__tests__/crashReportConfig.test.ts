/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
}));

import { crashSubmitUrl, readCrashReportingConfig, writeCrashReportingConfig } from '../crashReportConfig.js';

describe('crashReportConfig（崩溃上报开关）', () => {
  beforeEach(() => {
    state.userData = mkdtempSync(join(tmpdir(), 'hy-crash-'));
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
  });

  it('配置文件缺失时默认关闭', () => {
    expect(readCrashReportingConfig()).toEqual({ enabled: false });
  });

  it('写入后读回开启状态', () => {
    writeCrashReportingConfig({ enabled: true });
    expect(readCrashReportingConfig()).toEqual({ enabled: true });
  });

  it('非布尔 enabled 视为关闭', () => {
    writeFileSync(join(state.userData, 'crash-reporting.json'), JSON.stringify({ enabled: 'yes' }), 'utf-8');
    expect(readCrashReportingConfig()).toEqual({ enabled: false });
  });

  it('损坏 JSON 回退为关闭', () => {
    writeFileSync(join(state.userData, 'crash-reporting.json'), '{broken', 'utf-8');
    expect(readCrashReportingConfig()).toEqual({ enabled: false });
  });

  it('写盘失败被吞掉，不阻断设置流程', () => {
    const target = join(state.userData, 'blocked');
    writeFileSync(target, 'x', 'utf-8');
    state.userData = target;
    expect(() => writeCrashReportingConfig({ enabled: true })).not.toThrow();
    expect(readCrashReportingConfig()).toEqual({ enabled: false });
  });
});

describe('crashSubmitUrl（上报地址来自环境变量）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('未配置返回 undefined', () => {
    vi.stubEnv('HONGYUE_CRASH_REPORT_URL', '');
    expect(crashSubmitUrl()).toBeUndefined();
  });

  it('https 地址放行', () => {
    vi.stubEnv('HONGYUE_CRASH_REPORT_URL', 'https://crash.example.com/report');
    expect(crashSubmitUrl()).toBe('https://crash.example.com/report');
  });

  it('非 https 地址拒绝', () => {
    vi.stubEnv('HONGYUE_CRASH_REPORT_URL', 'http://crash.example.com/report');
    expect(crashSubmitUrl()).toBeUndefined();
  });
});
