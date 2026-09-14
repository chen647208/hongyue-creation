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
 * 退出导出：启用判定、逐书失败标记、重试触发；依赖注入，不触网。
 */
import type { SyncTransportConfig } from '@shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defaultExitExportConfig,
  type ExitExportDeps,
  loadExitExportConfig,
  retryPendingExitExports,
  runExitExport,
  saveExitExportConfig,
} from '../syncExitService';
import type { PendingExitExport, SyncRecoveryInput } from '../syncRecoveryService';

const TRANSPORT: SyncTransportConfig = { kind: 'local', directory: '/backup' };

function makeDeps(overrides: Partial<ExitExportDeps> = {}) {
  const records: SyncRecoveryInput[] = [];
  const failed = new Map<string, string>();
  const succeeded: string[] = [];
  let pending: PendingExitExport[] = [];
  const upload = vi.fn(async (_bookId: string, _config: SyncTransportConfig) => ({ key: 'k', changeCount: 1 }));
  const deps: ExitExportDeps = {
    listProjects: () => [{ id: 'b1', title: '甲' }, { id: 'b2', title: '乙' }],
    loadConfig: () => ({ enabled: true }),
    loadTransport: () => TRANSPORT,
    upload,
    record: (input) => {
      records.push(input);
      return { id: `r${records.length}`, at: 0, ...input };
    },
    markFailed: (bookId, message) => { failed.set(bookId, message); },
    markSucceeded: (bookId) => { failed.delete(bookId); succeeded.push(bookId); },
    listPending: () => pending,
    ...overrides,
  };
  return { deps, records, failed, succeeded, upload, setPending: (value: PendingExitExport[]) => { pending = value; } };
}

afterEach(() => {
  window.localStorage.clear();
});

describe('退出导出配置', () => {
  it('默认关闭，保存后读回', () => {
    expect(loadExitExportConfig()).toEqual(defaultExitExportConfig());
    saveExitExportConfig({ enabled: true });
    expect(loadExitExportConfig()).toEqual({ enabled: true });
  });

  it('损坏内容回落默认', () => {
    window.localStorage.setItem('sync.exitExport', '{broken');
    expect(loadExitExportConfig()).toEqual(defaultExitExportConfig());
  });

  it('书籍筛选随配置保存并读回', () => {
    saveExitExportConfig({ enabled: true, bookIds: ['b1'] });
    expect(loadExitExportConfig()).toEqual({ enabled: true, bookIds: ['b1'] });
    saveExitExportConfig({ enabled: true });
    expect(loadExitExportConfig().bookIds).toBeUndefined();
  });
});

describe('runExitExport', () => {
  it('未启用时不导出、不记录', async () => {
    const { deps, upload, records } = makeDeps({ loadConfig: () => ({ enabled: false }) });
    const summary = await runExitExport(deps);
    expect(summary).toEqual({ total: 0, succeeded: 0, failed: [] });
    expect(upload).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
  });

  it('未配置传输时逐书登记失败', async () => {
    const { deps, upload, records, failed } = makeDeps({ loadTransport: () => null });
    const summary = await runExitExport(deps);
    expect(upload).not.toHaveBeenCalled();
    expect(summary.total).toBe(2);
    expect(summary.succeeded).toBe(0);
    expect(summary.failed.map((f) => f.bookId).sort()).toEqual(['b1', 'b2']);
    expect(failed.size).toBe(2);
    expect(records.every((r) => r.outcome === 'failed' && r.kind === 'exit-export')).toBe(true);
  });

  it('逐书上传成功，登记成功并记录条数', async () => {
    const { deps, upload, records, failed } = makeDeps();
    const summary = await runExitExport(deps);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toEqual([]);
    expect(failed.size).toBe(0);
    expect(records.every((r) => r.outcome === 'ok' && r.applied === 1)).toBe(true);
  });

  it('单本失败不阻断其余，失败被标记', async () => {
    const { deps, records, failed } = makeDeps();
    (deps.upload as ReturnType<typeof vi.fn>).mockImplementation(async (bookId: string) => {
      if (bookId === 'b1') throw new Error('磁盘只读');
      return { key: 'k', changeCount: 2 };
    });
    const summary = await runExitExport(deps);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toHaveLength(1);
    expect(failed.get('b1')).toBe('磁盘只读');
    expect(records.find((r) => r.bookId === 'b1')!.outcome).toBe('failed');
  });

  it('按书筛选：只导出选中的书', async () => {
    const { deps, upload } = makeDeps({ loadConfig: () => ({ enabled: true, bookIds: ['b2'] }) });
    const summary = await runExitExport(deps);
    expect(summary.total).toBe(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect((upload as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('b2');
  });

  it('选中书为空数组：不导出任何书', async () => {
    const { deps, upload } = makeDeps({ loadConfig: () => ({ enabled: true, bookIds: [] }) });
    const summary = await runExitExport(deps);
    expect(summary).toEqual({ total: 0, succeeded: 0, failed: [] });
    expect(upload).not.toHaveBeenCalled();
  });

  it('单本上传超时按失败登记，不静默', async () => {
    const { deps, failed, records } = makeDeps();
    (deps.upload as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('退出导出上传超时（30000 毫秒）'));

    const summary = await runExitExport(deps);

    expect(summary.succeeded).toBe(0);
    expect(summary.failed).toHaveLength(2);
    expect(failed.get('b1')).toContain('超时');
    expect(records.every((r) => r.outcome === 'failed')).toBe(true);
  });
});

describe('retryPendingExitExports', () => {
  it('无待办时直接返回空摘要', async () => {
    const { deps, upload } = makeDeps();
    const summary = await retryPendingExitExports(deps);
    expect(summary).toEqual({ total: 0, succeeded: 0, failed: [] });
    expect(upload).not.toHaveBeenCalled();
  });

  it('重试成功后清除失败登记', async () => {
    const { deps, succeeded, failed, setPending } = makeDeps();
    setPending([{ bookId: 'b1', at: 1, message: '上次失败' }]);
    failed.set('b1', '上次失败');

    const summary = await retryPendingExitExports(deps);

    expect(summary.succeeded).toBe(1);
    expect(succeeded).toContain('b1');
    expect(failed.has('b1')).toBe(false);
  });

  it('重试仍失败时重新登记', async () => {
    const { deps, failed, setPending } = makeDeps();
    (deps.upload as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('仍不可用'));
    setPending([{ bookId: 'b2', at: 1, message: '上次失败' }]);

    const summary = await retryPendingExitExports(deps);

    expect(summary.succeeded).toBe(0);
    expect(summary.failed).toHaveLength(1);
    expect(failed.get('b2')).toBe('仍不可用');
  });
});
