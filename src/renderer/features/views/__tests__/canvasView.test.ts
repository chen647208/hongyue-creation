/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import {
  CANVAS_GRID_COLUMNS,
  CANVAS_GRID_GAP_X,
  CANVAS_GRID_GAP_Y,
  CANVAS_GRID_ORIGIN_X,
  CANVAS_GRID_ORIGIN_Y,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
} from '@shared/constants/views';
import { describe, expect, it } from 'vitest';

import { addCanvasEdge, canvasGridPoint, mergeCanvasDocument, moveCanvasNode, projectCanvas, removeCanvasEdge } from '../canvasView';
import type { CanvasDocument } from '../jsonCanvas';
import { parseCanvasText, serializeCanvas } from '../jsonCanvas';
import type { ViewRow } from '../types';

function row(id: string, kind: string, title: string): ViewRow {
  return { id, kind, title, cells: { title } };
}

const ROWS: ViewRow[] = [row('a', 'character', '甲'), row('b', 'location', '乙'), row('c', 'event', '丙')];

describe('canvasView：投影与坐标写回', () => {
  it('无坐标时按网格排布，行列由常量决定', () => {
    const projection = projectCanvas(undefined, ROWS);
    expect(projection.nodes[0]).toMatchObject({
      id: 'a',
      type: 'text',
      x: CANVAS_GRID_ORIGIN_X,
      y: CANVAS_GRID_ORIGIN_Y,
      width: CANVAS_NODE_WIDTH,
      height: CANVAS_NODE_HEIGHT,
      text: '甲',
      kind: 'character',
    });
    expect(canvasGridPoint(1).x).toBe(CANVAS_GRID_ORIGIN_X + CANVAS_NODE_WIDTH + CANVAS_GRID_GAP_X);
    expect(canvasGridPoint(CANVAS_GRID_COLUMNS).y).toBe(CANVAS_GRID_ORIGIN_Y + CANVAS_NODE_HEIGHT + CANVAS_GRID_GAP_Y);
  });

  it('已存坐标覆盖网格，且行节点内容仍来自行数据', () => {
    const layout = { positions: { b: { x: 512, y: 288 } } };
    const projection = projectCanvas(layout, ROWS);
    const node = projection.nodes.find((item) => item.id === 'b');
    expect(node).toMatchObject({ x: 512, y: 288, text: '乙' });
  });

  it('写回行节点坐标写入 positions，且不修改入参', () => {
    const moved = moveCanvasNode(undefined, 'a', { x: 500, y: 600 });
    expect(moved.positions?.a).toEqual({ x: 500, y: 600 });
    expect(projectCanvas(moved, ROWS).nodes[0]).toMatchObject({ x: 500, y: 600 });

    const snapshot = { ...moved.positions };
    moveCanvasNode(moved, 'a', { x: 1, y: 2 });
    expect(moved.positions).toEqual(snapshot);
  });

  it('写回自由节点坐标改自身，尺寸保留', () => {
    const layout = { nodes: [{ id: 'note1', type: 'text' as const, x: 0, y: 0, width: 100, height: 50, text: 'n' }] };
    const next = moveCanvasNode(layout, 'note1', { x: 10, y: 20 });
    expect(next.nodes?.[0]).toMatchObject({ id: 'note1', x: 10, y: 20, width: 100, height: 50 });
    expect(layout.nodes[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('连线去重、拒绝自环，并过滤失链', () => {
    const layout = addCanvasEdge(undefined, 'a', 'b');
    expect(layout.edges).toEqual([{ id: 'edge:a->b', fromNode: 'a', toNode: 'b' }]);
    expect(addCanvasEdge(layout, 'a', 'b').edges).toHaveLength(1);
    expect(addCanvasEdge(layout, 'a', 'a').edges).toHaveLength(1);
    expect(removeCanvasEdge(layout, 'edge:a->b').edges).toBeUndefined();

    const dangling = { edges: [{ id: 'x', fromNode: 'a', toNode: 'missing' }, { id: 'y', fromNode: 'a', toNode: 'c' }] };
    expect(projectCanvas(dangling, ROWS).edges.map((edge) => edge.id)).toEqual(['y']);
  });
});

describe('canvasView：导入合并与往返', () => {
  function incoming(): CanvasDocument {
    return {
      nodes: [
        { id: 'b', type: 'text', x: 320, y: 480, width: 180, height: 96, text: '乙' },
        { id: 'note1', type: 'text', x: 700, y: 40, width: 120, height: 60, text: '便签' },
      ],
      edges: [
        { id: 'e1', fromNode: 'b', toNode: 'note1' },
        { id: 'e2', fromNode: 'note1', toNode: 'ghost' },
      ],
    };
  }

  it('行节点补坐标、自由节点追加，失链连线丢弃并记录', () => {
    const merged = mergeCanvasDocument(undefined, ROWS, incoming());
    expect(merged.addedNodes).toBe(2);
    expect(merged.addedEdges).toBe(1);
    expect(merged.skippedEdges).toBe(1);
    expect(merged.issues).toHaveLength(1);
    expect(merged.layout.positions?.b).toMatchObject({ x: 320, y: 480 });
    expect(merged.layout.nodes).toHaveLength(1);
    expect(merged.layout.edges).toHaveLength(1);
  });

  it('既有坐标与节点优先，重复导入不新增', () => {
    const first = mergeCanvasDocument(undefined, ROWS, incoming());
    const again = mergeCanvasDocument(first.layout, ROWS, incoming());
    expect(again.addedNodes).toBe(0);
    expect(again.addedEdges).toBe(0);
    expect(again.layout).toEqual(first.layout);
  });

  it('导出再导入结果稳定（往返幂等）', () => {
    const base = mergeCanvasDocument(undefined, ROWS, incoming()).layout;
    const projection = projectCanvas(base, ROWS);
    const parsed = parseCanvasText(serializeCanvas({ nodes: projection.nodes, edges: projection.edges }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const roundTripped = mergeCanvasDocument(base, ROWS, parsed.document);
    expect(roundTripped.addedNodes).toBe(0);
    expect(roundTripped.addedEdges).toBe(0);
    expect(roundTripped.skippedEdges).toBe(0);
    expect(roundTripped.layout).toEqual(base);
  });

  it('与缺省网格一致的导入行节点不落库', () => {
    const grid = canvasGridPoint(1);
    const incomingDoc: CanvasDocument = {
      nodes: [{ id: 'b', type: 'text', ...grid, width: CANVAS_NODE_WIDTH, height: CANVAS_NODE_HEIGHT, text: '乙' }],
      edges: [],
    };
    const merged = mergeCanvasDocument(undefined, ROWS, incomingDoc);
    expect(merged.addedNodes).toBe(0);
    expect(merged.layout.positions).toBeUndefined();
  });
});
