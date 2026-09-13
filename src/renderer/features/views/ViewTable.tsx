/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 表格视图：基于 @tanstack/react-table 提供排序与列显隐。 */
import { type ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, type SortingState,useReactTable } from '@tanstack/react-table';
import React, { useMemo, useState } from 'react';

import type { ViewColumn, ViewRow } from './types';

interface ViewTableProps {
  rows: ViewRow[];
  columns: ViewColumn[];
  hidden: string[];
  sortKey?: string;
  sortDesc?: boolean;
  emptyText: string;
  onSortChange: (key: string | undefined, desc: boolean) => void;
  onHiddenChange: (hidden: string[]) => void;
  onSelectRow?: (row: ViewRow) => void;
}

const ViewTable: React.FC<ViewTableProps> = ({
  rows,
  columns,
  hidden,
  sortKey,
  sortDesc,
  emptyText,
  onSortChange,
  onHiddenChange,
  onSelectRow,
}) => {
  const [sorting, setSorting] = useState<SortingState>(sortKey ? [{ id: sortKey, desc: !!sortDesc }] : []);

  const columnDefs = useMemo<ColumnDef<ViewRow>[]>(
    () =>
      columns.map((column) => ({
        id: column.key,
        accessorFn: (row) => row.cells[column.key] ?? '',
        header: column.label,
        cell: (context) => context.getValue<string>(),
        size: column.width ?? 160,
      })),
    [columns],
  );

  const columnVisibility = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.key, !hidden.includes(column.key)])),
    [columns, hidden],
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting, columnVisibility },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(next);
      onSortChange(next[0]?.id, next[0] ? !!next[0].desc : false);
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater;
      onHiddenChange(columns.filter((column) => next[column.key] === false).map((column) => column.key));
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="h-full overflow-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border text-left text-xs text-muted-foreground">
              {headerGroup.headers.map((header) => (
                <th key={header.id} style={{ width: header.getSize() }} className="px-3 py-2 font-medium">
                  <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}
                  </button>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-b border-border/60 hover:bg-accent/40"
              onClick={() => onSelectRow?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="max-w-[320px] truncate px-3 py-2 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ViewTable;
