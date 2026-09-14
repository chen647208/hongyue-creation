/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { mcpToolId, remoteToolPermission } from '../mcpClient';

describe('mcpToolId', () => {
  it('命名空间化并转义点号', () => {
    expect(mcpToolId('builtin', 'list_books')).toBe('mcp.builtin.list_books');
    expect(mcpToolId('my.server', 'some.tool')).toBe('mcp.my_server.some_tool');
  });
});

describe('remoteToolPermission', () => {
  it('只读工具直通', () => {
    expect(remoteToolPermission('anything', { readOnly: true, proposal: false })).toBe('read');
  });

  it('内置 server 的提案工具直通（只入待审箱，不重复弹批）', () => {
    expect(remoteToolPermission('builtin', { readOnly: false, proposal: true })).toBe('read');
  });

  it('外部 server 的提案标记不可信，仍走审批（禁旁路）', () => {
    expect(remoteToolPermission('third-party', { readOnly: false, proposal: true })).toBe('write:proposal');
  });

  it('外部可写工具默认走审批', () => {
    expect(remoteToolPermission('third-party', { readOnly: false, proposal: false })).toBe('write:proposal');
  });
});
