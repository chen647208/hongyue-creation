/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

const userDataDir = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => ({
  app: { getPath: (_name: string) => userDataDir.current },
}));

import { approveMcpCommand,isMcpCommandApproved, mcpFingerprint } from '../commandApproval.js';

let dir = '';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hongyue-mcp-approval-'));
  userDataDir.current = dir;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('mcpFingerprint', () => {
  it('同命令同参数指纹稳定，参数不同即不同', () => {
    const a = mcpFingerprint('npx', ['-y', 'server']);
    expect(mcpFingerprint('npx', ['-y', 'server'])).toBe(a);
    expect(mcpFingerprint('npx', ['-y', 'other'])).not.toBe(a);
    expect(mcpFingerprint('node', ['-y', 'server'])).not.toBe(a);
  });
});

describe('审批持久化（userData/mcp-approved.json）', () => {
  it('未批准时 false；批准后 true，重启（重读文件）仍 true', () => {
    const fp = mcpFingerprint('npx', ['-y', 'server']);
    expect(isMcpCommandApproved(fp)).toBe(false);

    approveMcpCommand(fp);

    const file = path.join(dir, 'mcp-approved.json');
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual([fp]);
    expect(isMcpCommandApproved(fp)).toBe(true);
  });

  it('文件损坏或非字符串数组时按空集合处理，不抛错', () => {
    fs.writeFileSync(path.join(dir, 'mcp-approved.json'), '{broken', 'utf-8');
    expect(isMcpCommandApproved('whatever')).toBe(false);

    fs.writeFileSync(path.join(dir, 'mcp-approved.json'), '[1, "ok", null]', 'utf-8');
    expect(isMcpCommandApproved('ok')).toBe(true);
    expect(isMcpCommandApproved('1')).toBe(false);
  });

  it('写入失败不抛错（只影响下次仍需确认）', () => {
    const fp = mcpFingerprint('npx', ['-y', 'server']);
    // 目录被换成同名文件，writeFileSync 必然失败
    fs.writeFileSync(path.join(dir, 'mcp-approved.json'), 'x', 'utf-8');
    fs.rmSync(path.join(dir, 'mcp-approved.json'));
    fs.mkdirSync(path.join(dir, 'mcp-approved.json'));
    expect(() => approveMcpCommand(fp)).not.toThrow();
    fs.rmSync(path.join(dir, 'mcp-approved.json'), { recursive: true });
  });
});
