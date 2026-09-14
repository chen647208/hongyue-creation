/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import {
  formatCrossRef,
  parseCrossRefs,
  parseFigureDeclarations,
  resolveCrossRefs,
} from '../crossRef';

describe('交叉引用语法', () => {
  it('解析编号引用与自定义模板', () => {
    const hits = parseCrossRefs('见 ((#ch2)) 与 ((#fig1|图 %N))。');
    expect(hits.map((hit) => hit.target)).toEqual(['ch2', 'fig1']);
    expect(hits[0]?.template).toBeUndefined();
    expect(hits[1]?.template).toBe('图 %N');
    expect(formatCrossRef('ch2')).toBe('((#ch2))');
    expect(formatCrossRef('fig1', '%T')).toBe('((#fig1|%T))');
  });

  it('解析图表声明（图注可省）', () => {
    const decls = parseFigureDeclarations('正文\n# @figure: fig1 | 结构图\n# @figure: fig2');
    expect(decls).toEqual([
      { label: 'fig1', caption: '结构图', line: 2 },
      { label: 'fig2', line: 3 },
    ]);
  });

  it('按目标类型回落模板，缺失写失链标记', () => {
    const targets = new Map([
      ['ch2', { kind: 'chapter' as const, number: 2, title: '第二章' }],
      ['fig1', { kind: 'figure' as const, number: 1, title: '结构图' }],
    ]);
    expect(resolveCrossRefs('见 ((#ch2))，图 ((#fig1))，题 ((#ch2|第%N章))，名 ((#fig1|%T))。', targets))
      .toBe('见 2，图 图 1，题 第2章，名 结构图。');
    expect(resolveCrossRefs('((#missing))', targets)).toBe('【失链引用：missing】');
  });

  it('中文标题可作目标', () => {
    const targets = new Map([['第二章', { kind: 'chapter' as const, number: 2, title: '第二章' }]]);
    expect(resolveCrossRefs('见 ((#第二章))。', targets)).toBe('见 2。');
    expect(parseCrossRefs('((#第二章))')[0]?.target).toBe('第二章');
  });
});
