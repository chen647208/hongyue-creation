/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 画布视图的纯函数投影与坐标写回（docs/design/47 §2）。
 *
 * 单一真源：行投影节点的内容来自视图行，画布只存坐标与连线；自由节点（便签/图片/链接）
 * 没有对应行，其内容即真相。任何坐标写回都不修改入参，返回新布局。渲染器按需加载消费
 * projectCanvas 的结果；导入导出复用 JSON Canvas 开放格式。
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

import type { CanvasDocument, CanvasEdge, CanvasNode, CanvasValidationIssue } from './jsonCanvas';
import type { CanvasLayout, CanvasPoint, ViewRow } from './types';

/** 投影后的画布：节点与已过滤掉失链的连线。 */
export interface CanvasProjection {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** 缺省网格坐标：按行序号蛇形直排，列数与间距见 shared/constants/views。 */
export function canvasGridPoint(index: number): CanvasPoint {
  const column = index % CANVAS_GRID_COLUMNS;
  const rowIndex = Math.floor(index / CANVAS_GRID_COLUMNS);
  return {
    x: CANVAS_GRID_ORIGIN_X + column * (CANVAS_NODE_WIDTH + CANVAS_GRID_GAP_X),
    y: CANVAS_GRID_ORIGIN_Y + rowIndex * (CANVAS_NODE_HEIGHT + CANVAS_GRID_GAP_Y),
  };
}

function rowPoint(layout: CanvasLayout | undefined, id: string, index: number): CanvasPoint {
  return layout?.positions?.[id] ?? canvasGridPoint(index);
}

/**
 * 把行数据与画布布局投影为 JSON Canvas 节点与连线。
 * 行节点内容不落库：文本取行标题，类型作扩展字段；自由节点原样带入。缺席节点丢弃连线。
 */
export function projectCanvas(layout: CanvasLayout | undefined, rows: ViewRow[]): CanvasProjection {
  const nodes: CanvasNode[] = [];
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    if (ids.has(row.id)) return;
    const point = rowPoint(layout, row.id, index);
    nodes.push({
      id: row.id,
      type: 'text',
      x: point.x,
      y: point.y,
      width: point.width ?? CANVAS_NODE_WIDTH,
      height: point.height ?? CANVAS_NODE_HEIGHT,
      text: row.title,
      kind: row.kind,
    });
    ids.add(row.id);
  });
  for (const node of layout?.nodes ?? []) {
    // 行节点优先：自由节点与行 id 冲突时丢弃，避免同一 id 出现两份内容。
    if (ids.has(node.id)) continue;
    nodes.push(node);
    ids.add(node.id);
  }
  const edges = (layout?.edges ?? []).filter((edge) => ids.has(edge.fromNode) && ids.has(edge.toNode));
  return { nodes, edges };
}

/** 只保留非空字段，避免持久化空对象。 */
function cleanLayout(layout: CanvasLayout): CanvasLayout {
  const next: CanvasLayout = {};
  if (layout.positions && Object.keys(layout.positions).length > 0) next.positions = layout.positions;
  if (layout.nodes && layout.nodes.length > 0) next.nodes = layout.nodes;
  if (layout.edges && layout.edges.length > 0) next.edges = layout.edges;
  return next;
}

/**
 * 写回节点坐标：行节点写 positions，自由节点改自身坐标。
 * 返回新布局与新对象，调用方可直接存 ViewDefinition.config。
 */
export function moveCanvasNode(layout: CanvasLayout | undefined, nodeId: string, point: CanvasPoint): CanvasLayout {
  const nodes = [...(layout?.nodes ?? [])];
  const freeIndex = nodes.findIndex((node) => node.id === nodeId);
  const free = freeIndex >= 0 ? nodes[freeIndex] : undefined;
  if (free) {
    nodes[freeIndex] = {
      ...free,
      x: point.x,
      y: point.y,
      width: point.width ?? free.width,
      height: point.height ?? free.height,
    };
    return cleanLayout({ ...layout, nodes });
  }
  const positions = { ...(layout?.positions ?? {}), [nodeId]: { ...point } };
  return cleanLayout({ ...layout, positions });
}

/** 新增连线：自环与同向重复拒绝，返回原布局不变。 */
export function addCanvasEdge(layout: CanvasLayout | undefined, source: string, target: string, label?: string): CanvasLayout {
  if (source === '' || target === '' || source === target) return layout ?? {};
  const edges = [...(layout?.edges ?? [])];
  if (edges.some((edge) => edge.fromNode === source && edge.toNode === target)) return layout ?? {};
  const edge: CanvasEdge = { id: `edge:${source}->${target}`, fromNode: source, toNode: target };
  if (label) edge.label = label;
  edges.push(edge);
  return cleanLayout({ ...layout, edges });
}

/** 按 id 删除连线。 */
export function removeCanvasEdge(layout: CanvasLayout | undefined, edgeId: string): CanvasLayout {
  const edges = (layout?.edges ?? []).filter((edge) => edge.id !== edgeId);
  return cleanLayout({ ...layout, edges });
}

export interface CanvasMergeResult {
  layout: CanvasLayout;
  /** 新增节点数（行节点新增坐标或自由节点新增内容）。 */
  addedNodes: number;
  addedEdges: number;
  /** 丢弃的连线条数：端点不存在的失链连线（重复连线静默去重，不计入）。 */
  skippedEdges: number;
  /** 可读原因：解析问题与合并时丢弃的连线。 */
  issues: CanvasValidationIssue[];
}

/**
 * 把导入的 JSON Canvas 文档合并到当前视图：
 * - 行节点只补坐标，既有坐标优先（保留既有节点、不覆盖用户摆放）。
 * - 自由节点按 id 去重，新增追加到布局。
 * - 连线端点必须存在于合并后的节点集合，否则丢弃并记录（失链）。
 * - 与缺省网格坐标一致的导入行节点不落库，保证「导出再导入」结果稳定。
 */
export function mergeCanvasDocument(
  layout: CanvasLayout | undefined,
  rows: ViewRow[],
  incoming: CanvasDocument,
): CanvasMergeResult {
  const positions: Record<string, CanvasPoint> = { ...(layout?.positions ?? {}) };
  const nodes: CanvasNode[] = [...(layout?.nodes ?? [])];
  const rowIds = new Set(rows.map((row) => row.id));
  const indexById = new Map(rows.map((row, index) => [row.id, index]));
  const freeIds = new Set(nodes.map((node) => node.id));
  const issues: CanvasValidationIssue[] = [];
  let addedNodes = 0;

  for (const node of incoming.nodes) {
    if (rowIds.has(node.id)) {
      if (positions[node.id]) continue;
      const index = indexById.get(node.id);
      const grid = index === undefined ? undefined : canvasGridPoint(index);
      const sameAsGrid =
        grid !== undefined &&
        node.x === grid.x &&
        node.y === grid.y &&
        node.width === CANVAS_NODE_WIDTH &&
        node.height === CANVAS_NODE_HEIGHT;
      if (!sameAsGrid) {
        positions[node.id] = { x: node.x, y: node.y, width: node.width, height: node.height };
        addedNodes += 1;
      }
      continue;
    }
    if (freeIds.has(node.id)) continue;
    nodes.push(node);
    freeIds.add(node.id);
    addedNodes += 1;
  }

  const knownIds = new Set<string>([...rowIds, ...freeIds]);
  const edges: CanvasEdge[] = [...(layout?.edges ?? [])];
  const edgeKeys = new Set(edges.map((edge) => `${edge.fromNode}\u0000${edge.toNode}`));
  const edgeIds = new Set(edges.map((edge) => edge.id));
  let addedEdges = 0;
  let skippedEdges = 0;
  for (const edge of incoming.edges) {
    if (!knownIds.has(edge.fromNode) || !knownIds.has(edge.toNode)) {
      issues.push({ path: `edge:${edge.id}`, message: 'edge references a node that does not exist; dropped' });
      skippedEdges += 1;
      continue;
    }
    const key = `${edge.fromNode}\u0000${edge.toNode}`;
    // 去重：重复连线静默忽略，不计入丢失（往返导入同一视图不产生告警）。
    if (edgeKeys.has(key) || edgeIds.has(edge.id)) continue;
    edges.push(edge);
    edgeKeys.add(key);
    edgeIds.add(edge.id);
    addedEdges += 1;
  }

  return { layout: cleanLayout({ positions, nodes, edges }), addedNodes, addedEdges, skippedEdges, issues };
}
