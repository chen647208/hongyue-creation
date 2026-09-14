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
  handlers: new Map<string, (...args: any[]) => any>(),
  install: vi.fn(),
  list: vi.fn(),
  uninstall: vi.fn(),
  assertPath: vi.fn(),
  trusted: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: () => '/user-data' },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any): void => {
      state.handlers.set(channel, fn);
    },
  },
}));

vi.mock('../pluginStore.js', () => ({
  installPluginFromDirectory: state.install,
  listInstalledPlugins: state.list,
  uninstallInstalledPlugin: state.uninstall,
}));

vi.mock('../pluginTrust.js', () => ({ isTrustedPluginKey: state.trusted }));

vi.mock('../fsAccess.js', () => ({ assertPathAllowed: state.assertPath }));

import { IPC } from '../../channels.js';
import { registerPluginStoreIpc } from '../pluginStoreIpc.js';

const options = { pluginsRoot: '/user-data/plugins', isTrustedKey: state.trusted };

describe('registerPluginStoreIpc（安装/卸载/列表）', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.install.mockReset().mockResolvedValue({ ok: true });
    state.list.mockReset().mockResolvedValue([]);
    state.uninstall.mockReset().mockResolvedValue({ ok: true });
    state.assertPath.mockReset();
    registerPluginStoreIpc();
  });

  it('注册 install / uninstall / list 三个通道', () => {
    expect(state.handlers.has(IPC.plugin.install)).toBe(true);
    expect(state.handlers.has(IPC.plugin.uninstall)).toBe(true);
    expect(state.handlers.has(IPC.plugin.list)).toBe(true);
  });

  it('install 校验入参，越界路径由 assertPathAllowed 判定', async () => {
    const install = state.handlers.get(IPC.plugin.install)!;
    expect(() => install(null, null)).toThrow(TypeError);
    expect(() => install(null, {})).toThrow(TypeError);
    expect(() => install(null, { sourceDir: 5 })).toThrow(TypeError);

    state.assertPath.mockImplementation(() => {
      throw new Error('路径不在允许范围');
    });
    expect(() => install(null, { sourceDir: '/etc' })).toThrow('路径不在允许范围');
  });

  it('install 透传来源、签名与摘要选项', async () => {
    const install = state.handlers.get(IPC.plugin.install)!;
    await install(null, {
      sourceDir: '/src/pkg',
      hostVersion: '1.2.3',
      allowedSources: ['/src'],
      expectedDigest: 'abc',
      requireSignature: true,
    });
    expect(state.assertPath).toHaveBeenCalledWith('/src/pkg');
    expect(state.install).toHaveBeenCalledWith(options, '/src/pkg', {
      hostVersion: '1.2.3',
      allowedSources: ['/src'],
      expectedDigest: 'abc',
      requireSignature: true,
    });
  });

  it('uninstall 拒绝空串与非字符串，合法 id 走卸载', async () => {
    const uninstall = state.handlers.get(IPC.plugin.uninstall)!;
    expect(() => uninstall(null, '')).toThrow(TypeError);
    expect(() => uninstall(null, 5)).toThrow(TypeError);
    await expect(uninstall(null, 'com.a.b')).resolves.toEqual({ ok: true });
    expect(state.uninstall).toHaveBeenCalledWith(options, 'com.a.b');
  });

  it('list 返回已安装插件摘要', async () => {
    state.list.mockResolvedValue([{ id: 'com.a.b', name: 'A', version: '1.0.0' }]);
    const list = state.handlers.get(IPC.plugin.list)!;
    await expect(list(null)).resolves.toEqual([{ id: 'com.a.b', name: 'A', version: '1.0.0' }]);
    expect(state.list).toHaveBeenCalledWith(options);
  });
});
