/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import type { EntityViewData, ViewColumn, ViewRow } from '../types';
import { escapeCsvCell, escapeHtmlCell, escapeMarkdownCell, serializeViewTable } from '../viewExport';
import { applyViewQuery } from '../viewQuery';

const COLUMNS: ViewColumn[] = [
  { key: 'shotNumber', label: 'views.preset.storyboard.col.shotNumber' },
  { key: 'dialogue', label: 'views.preset.storyboard.col.dialogue' },
];

const ROWS: ViewRow[] = [
  {
    id: 's1',
    kind: 'shot',
    title: '1',
    cells: { shotNumber: '1', dialogue: '你好，世界' },
    values: { shotNumber: 1, dialogue: '你好，世界' },
  },
  {
    id: 's2',
    kind: 'shot',
    title: '2',
    cells: { shotNumber: '2', dialogue: '他说"走",然后|离开' },
    values: { shotNumber: 2, dialogue: '他说"走",然后|离开' },
  },
];

describe('单元格转义', () => {
  it('Markdown 转义竖线、反斜杠与换行', () => {
    expect(escapeMarkdownCell('a|b')).toBe('a\\|b');
    expect(escapeMarkdownCell('a\\b')).toBe('a\\\\b');
    expect(escapeMarkdownCell('a\nb')).toBe('a<br>b');
  });

  it('CSV 仅对含逗号/引号/换行的值加引号并翻倍内部引号', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
  });

  it('HTML 转义五个实体字符并换行转 br', () => {
    expect(escapeHtmlCell('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtmlCell('a\nb')).toBe('a<br>b');
  });
});

describe('serializeViewTable', () => {
  it('Markdown 输出表头、分隔行与单元格', () => {
    const md = serializeViewTable({ columns: COLUMNS, rows: ROWS }, 'md');
    expect(md).toContain('| views.preset.storyboard.col.shotNumber | views.preset.storyboard.col.dialogue |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| 2 | 他说"走",然后\\|离开 |');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('CSV 使用 CRLF 并对含逗号/引号的值加引号', () => {
    const csv = serializeViewTable({ columns: COLUMNS, rows: ROWS }, 'csv');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('views.preset.storyboard.col.shotNumber,views.preset.storyboard.col.dialogue');
    expect(lines[1]).toBe('1,你好，世界');
    expect(lines[2]).toBe('2,"他说""走"",然后|离开"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('HTML 输出 thead/tbody、caption 并转义', () => {
    const html = serializeViewTable({ columns: COLUMNS, rows: ROWS }, 'html', { caption: '分镜表' });
    expect(html).toContain('<caption>分镜表</caption>');
    expect(html).toContain('<th>views.preset.storyboard.col.shotNumber</th>');
    expect(html).toContain('<td>2</td>');
    expect(html).toContain('<td>他说&quot;走&quot;,然后|离开</td>');
  });

  it('labels 覆盖列标题且无列时返回空串', () => {
    const md = serializeViewTable(
      { columns: COLUMNS, rows: ROWS },
      'md',
      { labels: { shotNumber: '镜号', dialogue: '台词' } },
    );
    expect(md).toContain('| 镜号 | 台词 |');
    expect(serializeViewTable({ columns: [], rows: ROWS }, 'md')).toBe('');
  });

  it('导出保留计算列（含参数公式）', () => {
    const data: EntityViewData = { columns: COLUMNS, rows: ROWS, links: [] };
    const projection = applyViewQuery(data, {
      computed: [
        { key: 'computed:wordCount', label: 'wordCount', operator: 'length', operands: ['dialogue'] },
        {
          key: 'computed:speak',
          label: 'speak',
          operator: 'divide',
          operands: ['computed:wordCount', '$speechRate'],
          params: { speechRate: 2 },
        },
      ],
    });
    const csv = serializeViewTable({ columns: projection.columns, rows: projection.rows }, 'csv');
    expect(csv.split('\r\n')[0]).toContain('wordCount');
    expect(csv.split('\r\n')[0]).toContain('speak');
    expect(csv.split('\r\n')[1]?.endsWith(',5,2.5')).toBe(true);
  });
});
