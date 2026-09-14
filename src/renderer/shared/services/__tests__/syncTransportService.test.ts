// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 同步传输服务：配置读写（非密钥走 localStorage）、密钥引用、连通测试兜底、有限重试。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultSyncTransportConfig,
  loadSyncTransportConfig,
  retryAsync,
  saveSyncTransportConfig,
  storeSyncTransportSecret,
  SYNC_SECRET_IDS,
  testSyncTransport,
} from '../syncTransportService';

afterEach(() => {
  delete (window as { electronAPI?: unknown }).electronAPI;
  window.localStorage.clear();
});

function setElectronAPI(value: unknown): void {
  (window as { electronAPI?: unknown }).electronAPI = value;
}

describe('传输配置读写', () => {
  it('无存储时回落默认本地目录配置', () => {
    expect(loadSyncTransportConfig()).toEqual(defaultSyncTransportConfig());
  });

  it('保存后原样读回', () => {
    saveSyncTransportConfig({ kind: 'webdav', baseUrl: 'https://host/dav', authType: 'basic', username: 'u' });
    expect(loadSyncTransportConfig()).toEqual({ kind: 'webdav', baseUrl: 'https://host/dav', authType: 'basic', username: 'u' });
  });

  it('损坏或非法内容回落默认', () => {
    window.localStorage.setItem('sync.transport', '{broken');
    expect(loadSyncTransportConfig()).toEqual(defaultSyncTransportConfig());
    window.localStorage.setItem('sync.transport', JSON.stringify({ kind: 'ftp' }));
    expect(loadSyncTransportConfig()).toEqual(defaultSyncTransportConfig());
  });
});

describe('凭据与连通测试', () => {
  it('存密钥走 vault 并返回引用，不落明文配置', async () => {
    const set = vi.fn(async () => true);
    setElectronAPI({ sync: {}, vault: { set } });

    const ref = await storeSyncTransportSecret(SYNC_SECRET_IDS.webdav, 'p@ss');

    expect(set).toHaveBeenCalledWith('sync.webdav', 'p@ss');
    expect(ref).toBe('vault:sync.webdav');
    expect(JSON.stringify(loadSyncTransportConfig())).not.toContain('p@ss');
  });

  it('无桌面环境时连通测试返回可读失败', async () => {
    setElectronAPI(undefined);
    expect(await testSyncTransport(defaultSyncTransportConfig())).toEqual({ ok: false, message: '同步传输仅桌面端可用' });
  });

  it('委托主进程测试并透传结果', async () => {
    const testTransport = vi.fn(async () => ({ ok: false, message: '认证失败' }));
    setElectronAPI({ sync: { testTransport } });
    expect(await testSyncTransport(defaultSyncTransportConfig())).toEqual({ ok: false, message: '认证失败' });
  });
});

describe('retryAsync', () => {
  it('瞬时失败后成功', async () => {
    let calls = 0;
    const run = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error('flaky');
      return 'ok';
    });
    expect(await retryAsync(run, { maxAttempts: 2, delayMs: 0 })).toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('耗尽次数后抛最后一次错误', async () => {
    const run = vi.fn(async () => {
      throw new Error('always');
    });
    await expect(retryAsync(run, { maxAttempts: 3, delayMs: 0 })).rejects.toThrow('always');
    expect(run).toHaveBeenCalledTimes(3);
  });
});
