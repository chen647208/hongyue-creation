/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userData: '',
  save: vi.fn(),
  collect: vi.fn(),
  zip: vi.fn(),
  handlers: new Map<string, (...args: any[]) => any>(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => state.userData,
    getName: () => '红月创作',
    getVersion: () => '1.2.3',
  },
  dialog: { showSaveDialog: state.save },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any): void => {
      state.handlers.set(channel, fn);
    },
  },
}));

vi.mock('../diagnosticsCore.js', () => ({ collectDiagnostics: state.collect }));

vi.mock('../../../core/build/zipStore.js', () => ({ zipStore: state.zip }));

vi.mock('../../logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import type { BrowserWindow } from 'electron';

import { IPC } from '../../channels.js';
import { registerDiagnosticsIpc } from '../diagnostics.js';

describe('registerDiagnosticsIpc（诊断包导出）', () => {
  beforeEach(() => {
    vi.resetModules();
    state.userData = mkdtempSync(join(tmpdir(), 'hy-diag-ipc-'));
    state.handlers.clear();
    state.save.mockReset();
    state.collect.mockReset().mockResolvedValue({ 'app-info.json': '{}' });
    state.zip.mockReset().mockReturnValue(new Uint8Array([1, 2, 3]));
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
  });

  it('用户取消时返回 canceled，不写文件', async () => {
    state.save.mockResolvedValue({ canceled: true });
    registerDiagnosticsIpc(() => null);
    const handler = state.handlers.get(IPC.exportDiagnostics)!;
    await expect(handler(null)).resolves.toEqual({ canceled: true });
  });

  it('缺少 filePath 同样视为取消', async () => {
    state.save.mockResolvedValue({ canceled: false, filePath: undefined });
    registerDiagnosticsIpc(() => null);
    const handler = state.handlers.get(IPC.exportDiagnostics)!;
    await expect(handler(null)).resolves.toEqual({ canceled: true });
  });

  it('无主窗口时对话框不传父窗口，落盘返回路径', async () => {
    const target = join(state.userData, 'nested', 'diag.zip');
    state.save.mockResolvedValue({ canceled: false, filePath: target });
    registerDiagnosticsIpc(() => null);
    const handler = state.handlers.get(IPC.exportDiagnostics)!;

    await expect(handler(null)).resolves.toEqual({ canceled: false, path: target });
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.save.mock.calls[0]).toHaveLength(1);
    expect(state.collect).toHaveBeenCalledWith(
      state.userData,
      expect.objectContaining({ name: '红月创作', version: '1.2.3', platform: process.platform, arch: process.arch }),
    );
    expect(state.zip).toHaveBeenCalledWith({ 'app-info.json': '{}' });
    expect([...readFileSync(target)]).toEqual([1, 2, 3]);
  });

  it('有主窗口时作为父窗口传入对话框', async () => {
    const parent = { id: 1 };
    state.save.mockResolvedValue({ canceled: true });
    registerDiagnosticsIpc(() => parent as unknown as BrowserWindow);
    const handler = state.handlers.get(IPC.exportDiagnostics)!;

    await handler(null);
    expect(state.save).toHaveBeenCalledWith(parent, expect.objectContaining({ title: '导出诊断包' }));
  });
});
