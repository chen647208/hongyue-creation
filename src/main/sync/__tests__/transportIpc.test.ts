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
  vaultGet: vi.fn(),
  createTransport: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any): void => {
      state.handlers.set(channel, fn);
    },
  },
}));

vi.mock('../../logger.js', () => ({
  logger: { warn: state.warn, info: vi.fn(), error: vi.fn() },
}));

vi.mock('../transport.js', () => ({ createTransport: state.createTransport }));

vi.mock('../../app/secureStore.js', () => ({ vaultGet: state.vaultGet }));

import { IPC } from '../../channels.js';
import { registerSyncIpc } from '../transportIpc.js';

function makeTransport() {
  return {
    test: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => 'remote-content'),
    list: vi.fn(async () => ['a.json']),
    remove: vi.fn(async () => undefined),
  };
}

let transport: ReturnType<typeof makeTransport>;

describe('registerSyncIpc（同步传输 IPC）', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.vaultGet.mockReset().mockResolvedValue('secret-value');
    state.warn.mockClear();
    transport = makeTransport();
    state.createTransport.mockReset().mockReturnValue(transport);
    registerSyncIpc();
  });

  it('注册五个传输通道', () => {
    for (const channel of [
      IPC.sync.transportTest,
      IPC.sync.transportPut,
      IPC.sync.transportGet,
      IPC.sync.transportList,
      IPC.sync.transportRemove,
    ]) {
      expect(state.handlers.has(channel)).toBe(true);
    }
  });

  it('本地配置校验与连通测试成功', async () => {
    const test = state.handlers.get(IPC.sync.transportTest)!;
    await expect(test(null, { kind: 'local', directory: '/backup' })).resolves.toEqual({
      ok: true,
      message: '连接成功',
    });
    expect(state.createTransport).toHaveBeenCalledWith({ kind: 'local', directory: '/backup' }, {});
    expect(transport.test).toHaveBeenCalled();
  });

  it('非法配置与未知类型返回失败原因', async () => {
    const test = state.handlers.get(IPC.sync.transportTest)!;
    await expect(test(null, null)).resolves.toEqual({ ok: false, message: '传输配置必须是对象' });
    await expect(test(null, { kind: 'ftp' })).resolves.toEqual({
      ok: false,
      message: '未知的传输类型：ftp',
    });
    await expect(test(null, { kind: 'local' })).resolves.toEqual({
      ok: false,
      message: '传输配置字段 directory 必须是字符串',
    });
    await expect(test(null, { kind: 'webdav', baseUrl: 'https://dav', authType: 'oauth' })).resolves.toEqual({
      ok: false,
      message: 'WebDAV 认证方式非法',
    });
  });

  it('WebDAV 凭据经 vault 解引用，缺失时给出可读原因', async () => {
    const test = state.handlers.get(IPC.sync.transportTest)!;

    await expect(test(null, { kind: 'webdav', baseUrl: 'https://dav', authType: 'basic' })).resolves.toEqual({
      ok: false,
      message: 'WebDAV 凭据未保存到系统钥匙串，请先在设置中保存',
    });

    state.vaultGet.mockResolvedValue(null);
    await expect(
      test(null, { kind: 'webdav', baseUrl: 'https://dav', authType: 'basic', credentialRef: 'vault:dav' }),
    ).resolves.toEqual({ ok: false, message: 'WebDAV 凭据缺失或无法解密，请在设置中重新保存' });

    state.vaultGet.mockResolvedValue('dav-pw');
    state.createTransport.mockClear();
    await expect(
      test(null, {
        kind: 'webdav',
        baseUrl: 'https://dav',
        authType: 'basic',
        credentialRef: 'vault:dav',
        username: 'u',
        remoteDir: 'sync',
      }),
    ).resolves.toEqual({ ok: true, message: '连接成功' });
    expect(state.vaultGet).toHaveBeenCalledWith('dav');
    expect(state.createTransport).toHaveBeenCalledWith(
      { kind: 'webdav', baseUrl: 'https://dav', authType: 'basic', remoteDir: 'sync', username: 'u', credentialRef: 'vault:dav' },
      { password: 'dav-pw' },
    );
  });

  it('WebDAV authType none 无需凭据', async () => {
    const test = state.handlers.get(IPC.sync.transportTest)!;
    await expect(test(null, { kind: 'webdav', baseUrl: 'https://dav', authType: 'none' })).resolves.toEqual({
      ok: true,
      message: '连接成功',
    });
    expect(state.vaultGet).not.toHaveBeenCalled();
    expect(state.createTransport).toHaveBeenCalledWith(
      { kind: 'webdav', baseUrl: 'https://dav', authType: 'none', remoteDir: undefined, username: undefined, credentialRef: undefined },
      {},
    );
  });

  it('S3 缺 secretRef 拒绝，配置齐全时解引用并保留 pathStyle', async () => {
    const test = state.handlers.get(IPC.sync.transportTest)!;

    await expect(
      test(null, { kind: 's3', endpoint: 'https://s3', region: 'r', bucket: 'b', accessKeyId: 'ak' }),
    ).resolves.toEqual({ ok: false, message: 'S3 Secret Access Key 未保存到系统钥匙串，请先在设置中保存' });

    state.vaultGet.mockResolvedValue('sk');
    state.createTransport.mockClear();
    await expect(
      test(null, {
        kind: 's3',
        endpoint: 'https://s3',
        region: 'r',
        bucket: 'b',
        accessKeyId: 'ak',
        secretRef: 'vault:s3',
        pathStyle: true,
      }),
    ).resolves.toEqual({ ok: true, message: '连接成功' });
    expect(state.createTransport).toHaveBeenCalledWith(
      {
        kind: 's3',
        endpoint: 'https://s3',
        region: 'r',
        bucket: 'b',
        prefix: undefined,
        accessKeyId: 'ak',
        secretRef: 'vault:s3',
        pathStyle: true,
      },
      { secretAccessKey: 'sk' },
    );
  });

  it('连通测试底层失败返回可读消息并记 warn', async () => {
    transport.test.mockRejectedValue(new Error('connection refused'));
    const test = state.handlers.get(IPC.sync.transportTest)!;
    await expect(test(null, { kind: 'local', directory: '/backup' })).resolves.toEqual({
      ok: false,
      message: 'connection refused',
    });
    expect(state.warn).toHaveBeenCalled();
  });

  it('put 校验 key/data 并写入', async () => {
    const put = state.handlers.get(IPC.sync.transportPut)!;
    await expect(put(null, { kind: 'local', directory: '/d' }, null, 'data')).rejects.toThrow(TypeError);
    await expect(put(null, { kind: 'local', directory: '/d' }, 'key', 5)).rejects.toThrow(TypeError);
    await expect(put(null, { kind: 'local', directory: '/d' }, 'key', 'data')).resolves.toEqual({ ok: true });
    expect(transport.put).toHaveBeenCalledWith('key', 'data');
  });

  it('get 校验 key 并返回内容', async () => {
    const get = state.handlers.get(IPC.sync.transportGet)!;
    await expect(get(null, { kind: 'local', directory: '/d' }, 5)).rejects.toThrow(TypeError);
    await expect(get(null, { kind: 'local', directory: '/d' }, 'key')).resolves.toBe('remote-content');
    expect(transport.get).toHaveBeenCalledWith('key');
  });

  it('list 允许缺省 prefix，非法 prefix 拒绝', async () => {
    const list = state.handlers.get(IPC.sync.transportList)!;
    await expect(list(null, { kind: 'local', directory: '/d' }, 5)).rejects.toThrow(TypeError);
    await expect(list(null, { kind: 'local', directory: '/d' })).resolves.toEqual(['a.json']);
    await expect(list(null, { kind: 'local', directory: '/d' }, 'p')).resolves.toEqual(['a.json']);
    expect(transport.list).toHaveBeenNthCalledWith(1, undefined);
    expect(transport.list).toHaveBeenNthCalledWith(2, 'p');
  });

  it('remove 校验 key 并删除', async () => {
    const remove = state.handlers.get(IPC.sync.transportRemove)!;
    await expect(remove(null, { kind: 'local', directory: '/d' }, 5)).rejects.toThrow(TypeError);
    await expect(remove(null, { kind: 'local', directory: '/d' }, 'key')).resolves.toEqual({ ok: true });
    expect(transport.remove).toHaveBeenCalledWith('key');
  });
});
