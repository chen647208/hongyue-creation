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
 * 同步恢复记录：追加/读取/滚动上限；退出导出失败登记与清除。
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  appendSyncRecoveryRecord,
  clearExitExportFailure,
  clearPendingExitExports,
  clearSyncRecoveryRecords,
  listPendingExitExports,
  listSyncRecoveryRecords,
  markExitExportFailed,
  MAX_SYNC_RECORDS,
} from '../syncRecoveryService';

afterEach(() => {
  clearSyncRecoveryRecords();
  clearPendingExitExports();
});

describe('恢复记录读写', () => {
  it('追加后按时间倒序读回，且带生成 id/时间', () => {
    const first = appendSyncRecoveryRecord({ kind: 'import', outcome: 'ok', bookId: 'b1', applied: 2 });
    const second = appendSyncRecoveryRecord({ kind: 'download', outcome: 'failed', bookId: 'b2', message: '网络失败' });

    const records = listSyncRecoveryRecords();
    expect(records).toHaveLength(2);
    expect(records[0]!.id).toBe(second.id);
    expect(records[1]!.id).toBe(first.id);
    expect(records[0]!.at).toBeTypeOf('number');
    expect(records[0]!.message).toBe('网络失败');
  });

  it('超过上限时只保留最近 N 条', () => {
    for (let i = 0; i < MAX_SYNC_RECORDS + 5; i += 1) {
      appendSyncRecoveryRecord({ kind: 'import', outcome: 'ok', bookId: `b${i}` });
    }
    const records = listSyncRecoveryRecords();
    expect(records).toHaveLength(MAX_SYNC_RECORDS);
    expect(records[0]!.bookId).toBe(`b${MAX_SYNC_RECORDS + 4}`);
  });

  it('清空后无记录', () => {
    appendSyncRecoveryRecord({ kind: 'export', outcome: 'ok' });
    clearSyncRecoveryRecords();
    expect(listSyncRecoveryRecords()).toEqual([]);
  });
});

describe('退出导出失败登记', () => {
  it('失败按书记录，成功后清除', () => {
    markExitExportFailed('b1', '连接超时');
    markExitExportFailed('b2', '未配置传输');
    const pending = listPendingExitExports();
    expect(pending.map((p) => p.bookId).sort()).toEqual(['b1', 'b2']);
    expect(pending.find((p) => p.bookId === 'b1')!.message).toBe('连接超时');

    clearExitExportFailure('b1');
    expect(listPendingExitExports().map((p) => p.bookId)).toEqual(['b2']);
  });

  it('同一本书重复失败只保留最新原因', () => {
    markExitExportFailed('b1', '第一次');
    markExitExportFailed('b1', '第二次');
    const pending = listPendingExitExports();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.message).toBe('第二次');
  });
});
