/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { diffLines } from '../proposalDiff';

describe('diffLines', () => {
  it('中间替换：前后缀为 ctx，中间旧行 del、新行 add', () => {
    const diff = diffLines('第一行\n第二行\n第三行', '第一行\n改后\n第三行');
    expect(diff).toEqual([
      { op: 'ctx', text: '第一行' },
      { op: 'del', text: '第二行' },
      { op: 'add', text: '改后' },
      { op: 'ctx', text: '第三行' },
    ]);
  });

  it('纯追加只产生 add', () => {
    const diff = diffLines('甲', '甲\n乙');
    expect(diff).toEqual([
      { op: 'ctx', text: '甲' },
      { op: 'add', text: '乙' },
    ]);
  });

  it('相同文本只有 ctx', () => {
    expect(diffLines('甲\n乙', '甲\n乙').every((line) => line.op === 'ctx')).toBe(true);
  });
});
