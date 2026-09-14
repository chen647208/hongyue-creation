/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 视图投影结果的纯函数表格序列化：Markdown / CSV / HTML，不触碰存储与文件系统。 */
import type { ViewColumn, ViewRow } from './types';

export type TableFormat = 'md' | 'csv' | 'html';

export interface ViewTable {
  columns: ViewColumn[];
  rows: ViewRow[];
}

export interface ViewTableSerializeOptions {
  /** 列标题覆盖（i18n 解析后的显示名）；缺省用 column.label。 */
  labels?: Record<string, string>;
  /** 表格标题（HTML 表格的 caption）；缺省不输出。 */
  caption?: string;
}

function headerOf(column: ViewColumn, labels: Record<string, string> | undefined): string {
  return labels?.[column.key] ?? column.label;
}

/** 单元格取文本：cells 中的显示值，空值归一为空串。 */
export function cellText(row: ViewRow, key: string): string {
  const value = row.cells[key];
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Markdown：反斜杠与竖线转义，换行转 `<br>`（表格行内不能裸换行）。 */
export function escapeMarkdownCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '<br>').replace(/\|/g, '\\|');
}

/** CSV（RFC 4180）：含逗号、引号或换行的单元格加引号并把内部引号翻倍。 */
export function escapeCsvCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** HTML：五个实体字符转义，换行转 `<br>`。 */
export function escapeHtmlCell(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r\n|\r|\n/g, '<br>');
}

function toMarkdown(table: ViewTable, options: ViewTableSerializeOptions): string {
  const headers = table.columns.map((column) => escapeMarkdownCell(headerOf(column, options.labels)));
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${table.columns.map(() => '---').join(' | ')} |`,
  ];
  for (const row of table.rows) {
    lines.push(`| ${table.columns.map((column) => escapeMarkdownCell(cellText(row, column.key))).join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}

function toCsv(table: ViewTable, options: ViewTableSerializeOptions): string {
  const lines = [table.columns.map((column) => escapeCsvCell(headerOf(column, options.labels))).join(',')];
  for (const row of table.rows) {
    lines.push(table.columns.map((column) => escapeCsvCell(cellText(row, column.key))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function toHtml(table: ViewTable, options: ViewTableSerializeOptions): string {
  const headers = table.columns
    .map((column) => `<th>${escapeHtmlCell(headerOf(column, options.labels))}</th>`)
    .join('');
  const body = table.rows
    .map(
      (row) =>
        `<tr>${table.columns.map((column) => `<td>${escapeHtmlCell(cellText(row, column.key))}</td>`).join('')}</tr>`,
    )
    .join('\n');
  const caption = options.caption ? `<caption>${escapeHtmlCell(options.caption)}</caption>` : '';
  return `<table>\n${caption}<thead><tr>${headers}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>\n`;
}

/** 把投影后的列与行序列化为指定格式；无列时返回空串。 */
export function serializeViewTable(
  table: ViewTable,
  format: TableFormat,
  options: ViewTableSerializeOptions = {},
): string {
  if (table.columns.length === 0) return '';
  if (format === 'md') return toMarkdown(table, options);
  if (format === 'csv') return toCsv(table, options);
  return toHtml(table, options);
}
