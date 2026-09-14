/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ipc = vi.hoisted(() => {
  const handlers = new Map<string, () => void>();
  return {
    handlers,
    on: (ch: string, fn: () => void): void => { handlers.set(ch, fn); },
    removeListener: (ch: string): void => { handlers.delete(ch); },
  };
});

vi.mock('electron', () => ({
  ipcMain: { on: ipc.on, removeListener: ipc.removeListener },
}));

import { IPC } from '../../channels.js';
import { requestExitExport } from '../exitExport.js';

function fakeWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() },
  } as unknown as BrowserWindow;
}

describe('requestExitExport', () => {
  beforeEach(() => ipc.handlers.clear());

  it('无窗口时立即结束', async () => {
    await expect(requestExitExport(() => null)).resolves.toBeUndefined();
  });

  it('窗口已销毁时立即结束', async () => {
    const win = fakeWindow(true);
    await expect(requestExitExport(() => win)).resolves.toBeUndefined();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('发送退出导出请求，收到回执后结束并解绑', async () => {
    const win = fakeWindow();
    const done = requestExitExport(() => win);
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.sync.exitExportRequest);
    expect(ipc.handlers.has(IPC.sync.exitExportDone)).toBe(true);
    ipc.handlers.get(IPC.sync.exitExportDone)?.();
    await expect(done).resolves.toBeUndefined();
    expect(ipc.handlers.has(IPC.sync.exitExportDone)).toBe(false);
  });

  it('超时后结束', async () => {
    vi.useFakeTimers();
    try {
      const win = fakeWindow();
      const done = requestExitExport(() => win, 100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(done).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
