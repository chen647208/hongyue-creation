/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 大纲/叙事卡片视图：编号列表，突出名称与摘要。 */
import React from 'react';

import type { ViewRow } from './types';

interface ViewOutlineProps {
  rows: ViewRow[];
  kindLabel: (kind: string) => string;
  emptyText: string;
  onSelectRow?: (row: ViewRow) => void;
}

const ViewOutline: React.FC<ViewOutlineProps> = ({ rows, kindLabel, emptyText, onSelectRow }) => {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ol className="max-h-[440px] space-y-1 overflow-y-auto rounded-lg border border-border p-3">
      {rows.map((row, index) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onSelectRow?.(row)}
            className="flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40"
          >
            <span className="w-6 shrink-0 pt-0.5 text-xs text-muted-foreground">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">{kindLabel(row.kind)}</span>
                <span className="truncate text-sm font-medium">{row.title}</span>
              </span>
              {row.cells.summary && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.cells.summary}</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
};

export default ViewOutline;
