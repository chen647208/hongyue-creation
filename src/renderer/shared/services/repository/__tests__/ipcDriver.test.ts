/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * IpcSqlDriver 契约：顶层操作直连；事务内写缓冲为单次批量 IPC；
 * 读取前先下发缓冲（保序）；失败回滚且不下发缓冲。语句一律按 catalog id。
 */
import { describe, expect,it, vi } from 'vitest';

import { IpcSqlDriver } from '../ipcDriver';

type DbBridge = NonNullable<Window['electronAPI']>['db'];

function makeApi() {
  // all/get 与 electronAPI.db 同为泛型签名：mock 保留具体行型供断言侧使用，接入驱动时按泛型签名收敛。
  const all = vi.fn(async (_id: string, _params?: unknown[]): Promise<Record<string, unknown>[]> => []);
  const get = vi.fn(async (_id: string, _params?: unknown[]): Promise<Record<string, unknown> | undefined> => undefined);
  const api = {
    exec: vi.fn(async (_id: string) => undefined),
    run: vi.fn(async (_id: string, _params?: unknown[]) => ({ changes: 1, lastInsertRowid: 2 })),
    all,
    get,
    batch: vi.fn(async (_statements: unknown[]) => undefined),
    integrityCheck: vi.fn(async () => ({ ok: true, result: 'ok' })),
    fullIntegrityCheck: vi.fn(async () => ({ ok: true, result: 'ok' })),
    hotBackup: vi.fn(async () => ({ ok: true })),
    hotBackupList: vi.fn(async () => []),
    hotBackupVerify: vi.fn(async () => ({ ok: true })),
    hotBackupRestore: vi.fn(async () => ({ ok: true })),
    maintenance: vi.fn(async () => undefined),
    encryptionStatus: vi.fn(async () => ({ enabled: false, available: true, weakBackend: false, backend: 'default' })),
    enableEncryption: vi.fn(async () => ({ ok: true })),
    disableEncryption: vi.fn(async () => ({ ok: true })),
    exportRecoveryKey: vi.fn(async () => ({ ok: false })),
    applyRecoveryKey: vi.fn(async () => ({ ok: true })),
    encryptText: vi.fn(async () => ({ ok: true, data: 'x' })),
    decryptText: vi.fn(async () => ({ ok: true, text: '{}' })),
  };
  const bridge: DbBridge = { ...api, all: all as DbBridge['all'], get: get as DbBridge['get'] };
  return { api, bridge };
}

describe('IpcSqlDriver', () => {
  it('顶层 run 直连 api.run', async () => {
    const { api, bridge } = makeApi();
    const driver = new IpcSqlDriver(bridge);
    const result = await driver.run('nodes.selectAll', []);
    expect(api.run).toHaveBeenCalledWith('nodes.selectAll', []);
    expect(result).toEqual({ changes: 1, lastInsertRowid: 2 });
  });

  it('事务内写语句合并为一次批量 IPC', async () => {
    const { api, bridge } = makeApi();
    const driver = new IpcSqlDriver(bridge);
    await driver.transaction(async (tx) => {
      await tx.run('nodes.deleteAll', [1]);
      await tx.run('edges.deleteAll', [2]);
    });
    expect(api.batch).toHaveBeenCalledTimes(1);
    expect(api.batch.mock.calls[0]?.[0]).toEqual([
      { id: 'nodes.deleteAll', params: [1] },
      { id: 'edges.deleteAll', params: [2] },
    ]);
    expect(api.exec.mock.calls.map((c) => c[0])).toEqual(['engine.begin', 'engine.commit']);
    expect(api.run).not.toHaveBeenCalled();
  });

  it('事务内读取先下发改动再查询（保序）', async () => {
    const { api, bridge } = makeApi();
    api.all.mockResolvedValue([{ n: 1 }]);
    const driver = new IpcSqlDriver(bridge);
    const rows = await driver.transaction(async (tx) => {
      await tx.run('nodes.deleteAll', []);
      return tx.all('nodes.selectAll', []);
    });
    expect(rows).toEqual([{ n: 1 }]);
    expect(api.batch).toHaveBeenCalledTimes(1);
    expect(api.batch.mock.invocationCallOrder[0]!).toBeLessThan(api.all.mock.invocationCallOrder[0]!);
  });

  it('事务回调抛错：回滚且不下发缓冲', async () => {
    const { api, bridge } = makeApi();
    const driver = new IpcSqlDriver(bridge);
    await expect(
      driver.transaction(async (tx) => {
        await tx.run('nodes.deleteAll', []);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(api.batch).not.toHaveBeenCalled();
    expect(api.exec.mock.calls.map((c) => c[0])).toEqual(['engine.begin', 'engine.rollback']);
  });
});
