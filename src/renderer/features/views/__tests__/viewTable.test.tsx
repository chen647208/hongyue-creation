/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ViewColumn, ViewRow } from '../types';
import ViewTable from '../ViewTable';

afterEach(cleanup);

const COLUMNS: ViewColumn[] = [
  { key: 'title', label: '标题' },
  { key: 'kind', label: '类型', width: 120 },
];

function makeRow(id: string, title: string, kind: string): ViewRow {
  return { id, kind, title, cells: { title, kind } };
}

const ROWS: ViewRow[] = [
  makeRow('r1', 'Bravo', '角色'),
  makeRow('r2', 'alpha', '设定'),
  makeRow('r3', 'Charlie', '章节'),
];

function bodyCellTexts(): string[] {
  const bodyRows = screen.getAllByRole('row').slice(1);
  return bodyRows.map((row) => {
    const cells = row.querySelectorAll('td');
    return Array.from(cells, (cell) => cell.textContent ?? '').join('|');
  });
}

function renderTable(overrides: Partial<React.ComponentProps<typeof ViewTable>> = {}) {
  return render(
    <ViewTable
      rows={ROWS}
      columns={COLUMNS}
      hidden={[]}
      emptyText={'暂无数据'}
      onSortChange={vi.fn()}
      onHiddenChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ViewTable', () => {
  it('没有行时只显示空态文案，不渲染表格', () => {
    renderTable({ rows: [] });

    expect(screen.getByText('暂无数据')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('点击表头按升序、降序、取消排序循环，并回调 onSortChange', () => {
    const onSortChange = vi.fn();
    renderTable({ onSortChange });

    expect(bodyCellTexts()).toEqual(['Bravo|角色', 'alpha|设定', 'Charlie|章节']);

    const titleHeader = screen.getByRole('button', { name: '标题' });
    fireEvent.click(titleHeader);

    expect(onSortChange).toHaveBeenLastCalledWith('title', false);
    expect(bodyCellTexts()).toEqual(['alpha|设定', 'Bravo|角色', 'Charlie|章节']);
    expect(titleHeader.textContent).toContain('↑');

    fireEvent.click(titleHeader);

    expect(onSortChange).toHaveBeenLastCalledWith('title', true);
    expect(bodyCellTexts()).toEqual(['Charlie|章节', 'Bravo|角色', 'alpha|设定']);
    expect(titleHeader.textContent).toContain('↓');

    fireEvent.click(titleHeader);

    expect(onSortChange).toHaveBeenLastCalledWith(undefined, false);
    expect(bodyCellTexts()).toEqual(['Bravo|角色', 'alpha|设定', 'Charlie|章节']);
  });

  it('受控排序：按 sortKey/sortDesc 初始渲染对应顺序与箭头', () => {
    renderTable({ sortKey: 'title', sortDesc: true });

    const titleHeader = screen.getByRole('button', { name: /标题/ });
    expect(titleHeader.textContent).toContain('↓');
    expect(bodyCellTexts()).toEqual(['Charlie|章节', 'Bravo|角色', 'alpha|设定']);
  });

  it('受控列显隐：hidden 中的列不出现在表头和单元格中', () => {
    renderTable({ hidden: ['kind'] });

    expect(screen.getByRole('button', { name: '标题' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '类型' })).toBeNull();
    expect(bodyCellTexts()).toEqual(['Bravo', 'alpha', 'Charlie']);
  });

  it('点击行回调 onSelectRow，传入原始行数据', () => {
    const onSelectRow = vi.fn();
    renderTable({ onSelectRow });

    const alphaRow = screen.getByText('alpha').closest('tr');
    expect(alphaRow).not.toBeNull();
    fireEvent.click(alphaRow as HTMLTableRowElement);

    expect(onSelectRow).toHaveBeenCalledTimes(1);
    expect(onSelectRow).toHaveBeenCalledWith(ROWS[1]);
  });
});
