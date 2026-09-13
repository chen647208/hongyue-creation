/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 卡片视图：三列网格，长列表用 @tanstack/react-virtual 按行虚拟化。 */
import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useRef } from 'react';

import { Card, CardContent } from '@/shared/ui/Card';

import type { ViewRow } from './types';

const COLUMNS = 3;

interface ViewCardsProps {
  rows: ViewRow[];
  kindLabel: (kind: string) => string;
  emptyText: string;
  onSelectRow?: (row: ViewRow) => void;
}

const ViewCards: React.FC<ViewCardsProps> = ({ rows, kindLabel, emptyText, onSelectRow }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(rows.length / COLUMNS);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 148,
    overscan: 4,
  });

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const start = virtualRow.index * COLUMNS;
          return (
            <div
              key={virtualRow.key}
              className="grid grid-cols-3 gap-3 p-1"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
            >
              {rows.slice(start, start + COLUMNS).map((row) => (
                <Card
                  key={row.id}
                  interactive
                  className="cursor-pointer"
                  onClick={() => onSelectRow?.(row)}
                >
                  <CardContent className="space-y-1 p-3">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">{kindLabel(row.kind)}</span>
                      <span className="truncate text-sm font-medium">{row.title}</span>
                    </div>
                    {row.cells.summary && <p className="truncate text-xs text-muted-foreground">{row.cells.summary}</p>}
                    {row.cells.detail && <p className="line-clamp-2 text-xs text-muted-foreground/80">{row.cells.detail}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ViewCards;
