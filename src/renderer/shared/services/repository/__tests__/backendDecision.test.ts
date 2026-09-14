/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { decideStorageBackend } from '../index';

describe('decideStorageBackend', () => {
  it('有 IPC 时用桌面库', () => {
    expect(decideStorageBackend({ hasIpc: true, hasOpfs: true, sentinel: 'opfs' })).toEqual({ kind: 'ipc', mismatch: false });
  });

  it('无 IPC 有 OPFS 时用 OPFS 库', () => {
    expect(decideStorageBackend({ hasIpc: false, hasOpfs: true, sentinel: null })).toEqual({ kind: 'opfs', mismatch: false });
  });

  it('期望 OPFS 但不可用时标记 mismatch（不静默当空库）', () => {
    expect(decideStorageBackend({ hasIpc: false, hasOpfs: false, sentinel: 'sqlite-opfs' })).toEqual({ kind: 'local', mismatch: true });
  });

  it('无记录且不可用仅回退不告警', () => {
    expect(decideStorageBackend({ hasIpc: false, hasOpfs: false, sentinel: null })).toEqual({ kind: 'local', mismatch: false });
  });
});
