/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import type { ViewLayout } from '../types';
import { DEFAULT_VIEW_LAYOUT, parseViewLayout, serializeViewLayout } from '../viewLayout';

describe('viewLayout 公式脚本编解码', () => {
  it('表达式计算列可往返，且不需要 operator/operands', () => {
    const layout: ViewLayout = {
      ...DEFAULT_VIEW_LAYOUT,
      computed: [
        {
          key: 'computed:double',
          label: '双倍',
          expression: { kind: 'call', fn: 'multiply', args: [{ kind: 'field', key: 'wordCount' }, { kind: 'literal', value: 2 }] },
        },
      ],
    };
    const restored = parseViewLayout(serializeViewLayout(layout));
    expect(restored.computed).toEqual(layout.computed);
  });

  it('非法表达式整列丢弃（deny-by-default）', () => {
    const restored = parseViewLayout({
      computed: [{ key: 'bad', label: 'bad', expression: { kind: 'call', fn: 'eval', args: [] } }],
    });
    expect(restored.computed).toBeUndefined();
  });

  it('字段别名往返，非法值丢弃', () => {
    const layout: ViewLayout = { ...DEFAULT_VIEW_LAYOUT, fieldAliases: { 画面: 'image', 景别: 'framing' } };
    expect(parseViewLayout(serializeViewLayout(layout)).fieldAliases).toEqual({ 画面: 'image', 景别: 'framing' });
    expect(parseViewLayout({ fieldAliases: { 画面: 1, 景别: '' } }).fieldAliases).toBeUndefined();
  });
});

describe('viewLayout 计算列键冲突', () => {
  const flat = { key: 'computed:double', label: '双倍', operator: 'add' as const, operands: ['age', 'age'] };

  it('计算列键与既有列重复时拒绝该计算列，列保持一份', () => {
    const restored = parseViewLayout({
      columns: [
        { key: 'title', label: '名称' },
        { key: 'computed:double', label: '双倍' },
      ],
      computed: [flat, { key: 'computed:ok', label: '可用', operator: 'add', operands: ['age'] }],
    });
    expect(restored.computed?.map((column) => column.key)).toEqual(['computed:ok']);
    expect(restored.columns.map((column) => column.key)).toEqual(['title', 'computed:double']);
  });

  it('columns 缺席时以内置列为既有列，撞内置键同样拒绝', () => {
    expect(parseViewLayout({ computed: [{ ...flat, key: 'title' }] }).computed).toBeUndefined();
    expect(parseViewLayout({ computed: [flat] }).computed).toEqual([flat]);
  });

  it('计算列键彼此重复时只保留首条', () => {
    const restored = parseViewLayout({ computed: [flat, { ...flat, label: '另一条' }] });
    expect(restored.computed).toEqual([flat]);
  });

  it('不冲突的计算列往返不变', () => {
    expect(parseViewLayout(serializeViewLayout({ ...DEFAULT_VIEW_LAYOUT, computed: [flat] })).computed).toEqual([flat]);
  });
});
