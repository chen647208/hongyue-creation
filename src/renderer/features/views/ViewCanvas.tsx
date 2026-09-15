/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 画布视图渲染器：绝对定位节点 + SVG 连线。按需加载，不进默认视图包。
 * 节点支持指针拖动与键盘方向键微调；连线通过节点上的「连线」按钮两次点击建立。
 * 坐标写回由父层调用 moveCanvasNode 完成，本组件不持有持久状态。
 */
import { CANVAS_KEYBOARD_STEP, CANVAS_PADDING } from '@shared/constants/views';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/shared/utils/cn';

import type { CanvasProjection } from './canvasView';
import type { CanvasEdge, CanvasNode } from './jsonCanvas';
import type { CanvasPoint } from './types';

/** 按行类型着色，与图视图同一语义色板。 */
const KIND_COLORS: Record<string, string> = {
  character: 'var(--color-chart-1)',
  location: 'var(--color-chart-2)',
  faction: 'var(--color-chart-3)',
  event: 'var(--color-chart-4)',
};

interface CanvasViewProps {
  projection: CanvasProjection;
  emptyText: string;
  connectLabel: string;
  connectHint: string;
  cancelConnectLabel: string;
  removeEdgeLabel: string;
  moveHint: string;
  nodeLabel: (node: CanvasNode) => string;
  onMoveNode: (id: string, point: CanvasPoint) => void;
  onConnect: (source: string, target: string) => void;
  onRemoveEdge: (edgeId: string) => void;
  onSelectNode?: (id: string) => void;
}

interface DragState {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CanvasView: React.FC<CanvasViewProps> = ({
  projection,
  emptyText,
  connectLabel,
  connectHint,
  cancelConnectLabel,
  removeEdgeLabel,
  moveHint,
  nodeLabel,
  onMoveNode,
  onConnect,
  onRemoveEdge,
  onSelectNode,
}) => {
  const [draft, setDraft] = useState<Record<string, CanvasPoint>>({});
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // 画布尺寸随内容与拖动临时位置增长；平移量只按已提交坐标计算，避免拖动时抖动。
  const bounds = useMemo(() => {
    const nodes = projection.nodes;
    if (nodes.length === 0) return { offsetX: CANVAS_PADDING, offsetY: CANVAS_PADDING, width: CANVAS_PADDING * 2, height: CANVAS_PADDING * 2 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    for (const node of nodes) {
      const point = draft[node.id];
      if (!point) continue;
      maxX = Math.max(maxX, point.x + node.width);
      maxY = Math.max(maxY, point.y + node.height);
    }
    const offsetX = minX < CANVAS_PADDING ? CANVAS_PADDING - minX : 0;
    const offsetY = minY < CANVAS_PADDING ? CANVAS_PADDING - minY : 0;
    return { offsetX, offsetY, width: maxX + offsetX + CANVAS_PADDING, height: maxY + offsetY + CANVAS_PADDING };
  }, [projection.nodes, draft]);

  const boxes = useMemo(() => {
    const map = new Map<string, Box>();
    for (const node of projection.nodes) {
      const point = draft[node.id] ?? { x: node.x, y: node.y };
      map.set(node.id, { x: point.x + bounds.offsetX, y: point.y + bounds.offsetY, width: node.width, height: node.height });
    }
    return map;
  }, [projection.nodes, draft, bounds]);

  const edgeLines = useMemo(() => {
    const lines: Array<{ edge: CanvasEdge; x1: number; y1: number; x2: number; y2: number; mx: number; my: number }> = [];
    for (const edge of projection.edges) {
      const from = boxes.get(edge.fromNode);
      const to = boxes.get(edge.toNode);
      if (!from || !to) continue;
      const x1 = from.x + from.width / 2;
      const y1 = from.y + from.height / 2;
      const x2 = to.x + to.width / 2;
      const y2 = to.y + to.height / 2;
      lines.push({ edge, x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 });
    }
    return lines;
  }, [projection.edges, boxes]);

  useEffect(() => {
    if (connectFrom === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConnectFrom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connectFrom]);

  if (projection.nodes.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, node: CanvasNode) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = innerRef.current?.getBoundingClientRect();
    const box = boxes.get(node.id);
    if (!rect || !box) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: node.id, pointerId: event.pointerId, offsetX: event.clientX - rect.left - box.x, offsetY: event.clientY - rect.top - box.y });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = innerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDraft((previous) => ({
      ...previous,
      [drag.id]: { x: event.clientX - rect.left - drag.offsetX, y: event.clientY - rect.top - drag.offsetY },
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = draft[drag.id];
    if (point) onMoveNode(drag.id, point);
    setDraft((previous) => {
      const next = { ...previous };
      delete next[drag.id];
      return next;
    });
    setDrag(null);
  };

  const handleNodeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, node: CanvasNode) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSelectNode?.(node.id);
      return;
    }
    const step = event.shiftKey ? CANVAS_KEYBOARD_STEP * 4 : CANVAS_KEYBOARD_STEP;
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowUp') dy = -step;
    else if (event.key === 'ArrowDown') dy = step;
    else if (event.key === 'ArrowLeft') dx = -step;
    else if (event.key === 'ArrowRight') dx = step;
    else return;
    event.preventDefault();
    onMoveNode(node.id, { x: node.x + dx, y: node.y + dy });
  };

  const handleConnect = (node: CanvasNode) => {
    if (connectFrom === null) {
      setConnectFrom(node.id);
      return;
    }
    if (connectFrom === node.id) {
      setConnectFrom(null);
      return;
    }
    onConnect(connectFrom, node.id);
    setConnectFrom(null);
  };

  return (
    <div className="h-full overflow-auto rounded-lg border border-border bg-card" role="group" aria-label={emptyText}>
      <div ref={innerRef} className="relative" style={{ width: bounds.width, height: bounds.height }}>
        <svg className="pointer-events-none absolute inset-0" width={bounds.width} height={bounds.height} aria-hidden="true">
          <defs>
            <marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-border)" />
            </marker>
          </defs>
          {edgeLines.map((line) => (
            <line
              key={line.edge.id}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="var(--color-border)"
              strokeWidth={1.5}
              markerEnd="url(#canvas-arrow)"
            />
          ))}
        </svg>
        {edgeLines.map((line) => (
          <div
            key={`label-${line.edge.id}`}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded bg-card px-1 text-[10px] text-muted-foreground"
            style={{ left: line.mx, top: line.my }}
          >
            {line.edge.label ? <span>{line.edge.label}</span> : null}
            <button
              type="button"
              aria-label={`${removeEdgeLabel}: ${line.edge.label ?? line.edge.id}`}
              className="touch-target leading-none text-muted-foreground hover:text-destructive"
              onClick={() => onRemoveEdge(line.edge.id)}
            >
              ×
            </button>
          </div>
        ))}
        {projection.nodes.map((node) => {
          const box = boxes.get(node.id);
          if (!box) return null;
          const active = connectFrom === node.id;
          const text = node.text ?? node.label ?? node.url ?? node.file ?? node.id;
          return (
            <div
              key={node.id}
              role="button"
              tabIndex={0}
              aria-label={nodeLabel(node)}
              title={moveHint}
              className={cn(
                'absolute flex cursor-grab touch-none flex-col justify-between overflow-hidden rounded-lg border bg-card p-2 text-xs shadow-sm',
                active ? 'border-primary ring-2 ring-primary/40' : 'border-border',
              )}
              style={{ left: box.x, top: box.y, width: box.width, height: box.height, borderLeftWidth: 4, borderLeftColor: KIND_COLORS[node.kind ?? ''] ?? 'var(--color-muted-foreground)' }}
              onPointerDown={(event) => handlePointerDown(event, node)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onKeyDown={(event) => handleNodeKeyDown(event, node)}
              onClick={() => onSelectNode?.(node.id)}
            >
              <span className="overflow-hidden font-medium">{text}</span>
              <button
                type="button"
                aria-pressed={active}
                aria-label={`${connectLabel}: ${nodeLabel(node)}`}
                className="touch-target w-fit rounded border border-border px-1 text-[10px] text-muted-foreground hover:text-primary"
                onClick={(event) => {
                  event.stopPropagation();
                  handleConnect(node);
                }}
              >
                {active ? cancelConnectLabel : connectLabel}
              </button>
            </div>
          );
        })}
        {connectFrom && (
          <p role="status" className="absolute bottom-2 left-2 rounded bg-card px-2 py-1 text-2xs text-muted-foreground shadow-sm">
            {connectHint}
          </p>
        )}
      </div>
    </div>
  );
};

export default CanvasView;
