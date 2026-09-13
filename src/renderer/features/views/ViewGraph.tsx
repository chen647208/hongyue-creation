/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 图视图：按实体类型着色，边来自角色↔势力↔地点↔事件的关联。 */
import React, { useMemo } from 'react';

import type { ViewLink, ViewRow } from './types';

const WIDTH = 800;
const HEIGHT = 480;

const KIND_COLORS: Record<string, string> = {
  character: 'var(--color-chart-1)',
  location: 'var(--color-chart-2)',
  faction: 'var(--color-chart-3)',
  event: 'var(--color-chart-4)',
};

interface ViewGraphProps {
  rows: ViewRow[];
  links: ViewLink[];
  kindLabel: (kind: string) => string;
  emptyText: string;
  onSelectRow?: (row: ViewRow) => void;
}

const ViewGraph: React.FC<ViewGraphProps> = ({ rows, links, kindLabel, emptyText, onSelectRow }) => {
  const positions = useMemo(() => {
    const result: Record<string, { x: number; y: number }> = {};
    const count = rows.length || 1;
    const radius = Math.min(200, 70 + count * 6);
    rows.forEach((row, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      result[row.id] = { x: WIDTH / 2 + Math.cos(angle) * radius, y: HEIGHT / 2 + Math.sin(angle) * radius };
    });
    return result;
  }, [rows]);

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="h-full overflow-auto rounded-lg border border-border bg-card">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full">
        {links.map((link, index) => {
          const from = positions[link.source];
          const to = positions[link.target];
          if (!from || !to) return null;
          return (
            <line
              key={`${link.source}-${link.target}-${index}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          );
        })}
        {rows.map((row) => {
          const point = positions[row.id];
          if (!point) return null;
          return (
            <g key={row.id} className="cursor-pointer" onClick={() => onSelectRow?.(row)}>
              <circle cx={point.x} cy={point.y} r={14} fill={KIND_COLORS[row.kind] ?? 'var(--color-muted-foreground)'} opacity={0.85} />
              <text x={point.x} y={point.y + 28} textAnchor="middle" className="fill-current text-[10px]" style={{ fill: 'var(--color-foreground)' }}>
                {row.title.length > 8 ? `${row.title.slice(0, 8)}…` : row.title}
              </text>
              <title>{`${kindLabel(row.kind)}：${row.title}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default ViewGraph;
