/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 视图布局的默认值与编解码：config 为自由结构，读取时逐字段校验。 */
import { validateFormulaExpr } from '@shared/formulaScript';

import { ENTITY_VIEW_COLUMNS } from './buildEntityView';
import { parseCanvasDocument } from './jsonCanvas';
import type {
  AggregationKind,
  CanvasLayout,
  CanvasPoint,
  ChartAggregate,
  ChartChannel,
  ChartFieldBinding,
  ChartMark,
  ChartSpec,
  ChartValueType,
  ComputedColumn,
  ConditionOperator,
  FormulaOperator,
  QueryCondition,
  QueryLeaf,
  ViewAggregation,
  ViewColumn,
  ViewKind,
  ViewLayout,
} from './types';

const KINDS: readonly ViewKind[] = ['table', 'card', 'graph', 'list', 'reader', 'chart', 'canvas'];

const CHART_MARKS: readonly ChartMark[] = ['point', 'bar', 'line', 'area'];
const CHART_CHANNELS: readonly ChartChannel[] = ['x', 'y', 'size', 'color', 'shape'];
const CHART_VALUE_TYPES: readonly ChartValueType[] = ['nominal', 'ordinal', 'quantitative', 'temporal'];
const CHART_AGGREGATES: readonly ChartAggregate[] = ['count', 'sum', 'avg', 'min', 'max'];

const CONDITION_OPERATORS: readonly ConditionOperator[] = [
  'eq',
  'neq',
  'contains',
  'notContains',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'notEmpty',
];

const FORMULA_OPERATORS: readonly FormulaOperator[] = ['add', 'subtract', 'multiply', 'divide', 'min', 'max', 'concat', 'length'];

const AGGREGATION_KINDS: readonly AggregationKind[] = ['count', 'sum', 'avg', 'longest', 'latest'];

export const DEFAULT_VIEW_LAYOUT: ViewLayout = {
  kind: 'card',
  columns: ENTITY_VIEW_COLUMNS,
  hidden: [],
  sortKey: 'title',
  sortDesc: false,
};

function isViewKind(value: unknown): value is ViewKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

function isConditionOperator(value: unknown): value is ConditionOperator {
  return typeof value === 'string' && (CONDITION_OPERATORS as readonly string[]).includes(value);
}

function isFormulaOperator(value: unknown): value is FormulaOperator {
  return typeof value === 'string' && (FORMULA_OPERATORS as readonly string[]).includes(value);
}

function isAggregationKind(value: unknown): value is AggregationKind {
  return typeof value === 'string' && (AGGREGATION_KINDS as readonly string[]).includes(value);
}

function parseCondition(value: unknown): QueryCondition | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const node = value as Record<string, unknown>;
  if (node.type === 'and' || node.type === 'or' || node.type === 'not') {
    const children = Array.isArray(node.children)
      ? node.children.map((child) => parseCondition(child)).filter((child): child is QueryCondition => child !== undefined)
      : [];
    return { type: node.type, children };
  }
  if (node.type === 'leaf' && typeof node.field === 'string' && node.field !== '' && isConditionOperator(node.operator)) {
    const leaf: QueryLeaf = { type: 'leaf', field: node.field, operator: node.operator };
    if (typeof node.value === 'string' || typeof node.value === 'number') leaf.value = node.value;
    return leaf;
  }
  return undefined;
}

function parseComputedColumns(value: unknown): ComputedColumn[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const columns: ComputedColumn[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.key !== 'string' || record.key === '') continue;
    const operands = Array.isArray(record.operands)
      ? record.operands.filter((operand): operand is string => typeof operand === 'string' && operand !== '')
      : [];
    // 计算列有两种形态：公式脚本表达式，或扁平 operator+operands；两者都没有即丢弃。
    const parsedExpression = record.expression !== undefined ? validateFormulaExpr(record.expression) : undefined;
    const hasFlat = isFormulaOperator(record.operator) && operands.length > 0;
    if (parsedExpression && !parsedExpression.ok) continue; // deny-by-default：非法表达式不注册
    if (!parsedExpression && !hasFlat) continue;
    const column: ComputedColumn = {
      key: record.key,
      label: typeof record.label === 'string' ? record.label : record.key,
    };
    if (parsedExpression) column.expression = parsedExpression.expr;
    else {
      column.operator = record.operator as ComputedColumn['operator'];
      column.operands = operands;
    }
    if (typeof record.width === 'number') column.width = record.width;
    if (typeof record.params === 'object' && record.params !== null && !Array.isArray(record.params)) {
      const params: Record<string, number> = {};
      for (const [name, value] of Object.entries(record.params as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) params[name] = value;
      }
      if (Object.keys(params).length > 0) column.params = params;
    }
    columns.push(column);
  }
  return columns.length > 0 ? columns : undefined;
}

function parseFieldAliases(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const aliases: Record<string, string> = {};
  for (const [source, target] of Object.entries(value as Record<string, unknown>)) {
    if (source === '' || typeof target !== 'string' || target === '') continue;
    aliases[source] = target;
  }
  return Object.keys(aliases).length > 0 ? aliases : undefined;
}

function parseChartBinding(value: unknown): ChartFieldBinding | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.field !== 'string' || record.field === '') return undefined;
  if (typeof record.channel !== 'string' || !(CHART_CHANNELS as readonly string[]).includes(record.channel)) return undefined;
  const binding: ChartFieldBinding = { field: record.field, channel: record.channel as ChartChannel };
  if (typeof record.type === 'string' && (CHART_VALUE_TYPES as readonly string[]).includes(record.type)) binding.type = record.type as ChartValueType;
  if (typeof record.aggregate === 'string' && (CHART_AGGREGATES as readonly string[]).includes(record.aggregate)) binding.aggregate = record.aggregate as ChartAggregate;
  return binding;
}

function parseChartSpec(value: unknown): ChartSpec | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const mark = typeof record.mark === 'string' && (CHART_MARKS as readonly string[]).includes(record.mark) ? (record.mark as ChartMark) : 'bar';
  const bindings: ChartFieldBinding[] = [];
  const seen = new Set<ChartChannel>();
  for (const item of Array.isArray(record.bindings) ? record.bindings : []) {
    const binding = parseChartBinding(item);
    // 同一通道只保留首条声明，避免投影出现歧义。
    if (!binding || seen.has(binding.channel)) continue;
    seen.add(binding.channel);
    bindings.push(binding);
  }
  return bindings.length > 0 ? { mark, bindings } : undefined;
}

function parseAggregations(value: unknown): ViewAggregation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const aggregations: ViewAggregation[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.field !== 'string' || record.field === '' || !isAggregationKind(record.kind)) continue;
    const aggregation: ViewAggregation = { field: record.field, kind: record.kind };
    if (typeof record.label === 'string') aggregation.label = record.label;
    aggregations.push(aggregation);
  }
  return aggregations.length > 0 ? aggregations : undefined;
}

function parseCanvasPoint(value: unknown): CanvasPoint | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.x !== 'number' || !Number.isFinite(record.x) || typeof record.y !== 'number' || !Number.isFinite(record.y)) return undefined;
  const point: CanvasPoint = { x: record.x, y: record.y };
  if (typeof record.width === 'number' && Number.isFinite(record.width) && record.width > 0) point.width = record.width;
  if (typeof record.height === 'number' && Number.isFinite(record.height) && record.height > 0) point.height = record.height;
  return point;
}

function parseCanvasLayout(value: unknown): CanvasLayout | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const positions: Record<string, CanvasPoint> = {};
  if (typeof record.positions === 'object' && record.positions !== null && !Array.isArray(record.positions)) {
    for (const [id, raw] of Object.entries(record.positions as Record<string, unknown>)) {
      if (id === '') continue;
      const point = parseCanvasPoint(raw);
      if (point) positions[id] = point;
    }
  }
  // 自由节点与连线复用 JSON Canvas 校验；单条非法即降级丢弃。
  const parsed = parseCanvasDocument({ nodes: record.nodes, edges: record.edges });
  const nodes = parsed.ok ? parsed.document.nodes : [];
  const edges = parsed.ok ? parsed.document.edges : [];
  const canvas: CanvasLayout = {};
  if (Object.keys(positions).length > 0) canvas.positions = positions;
  if (nodes.length > 0) canvas.nodes = nodes;
  if (edges.length > 0) canvas.edges = edges;
  return Object.keys(canvas).length > 0 ? canvas : undefined;
}

function serializeCanvasLayout(layout: CanvasLayout): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (layout.positions && Object.keys(layout.positions).length > 0) out.positions = layout.positions;
  if (layout.nodes && layout.nodes.length > 0) out.nodes = layout.nodes;
  if (layout.edges && layout.edges.length > 0) out.edges = layout.edges;
  return out;
}

function parseColumns(value: unknown): ViewColumn[] {
  if (!Array.isArray(value)) return ENTITY_VIEW_COLUMNS;
  const columns = value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      key: typeof item.key === 'string' ? item.key : '',
      label: typeof item.label === 'string' ? item.label : String(item.key ?? ''),
      width: typeof item.width === 'number' ? item.width : undefined,
    }))
    .filter((column) => column.key.length > 0);
  return columns.length > 0 ? columns : ENTITY_VIEW_COLUMNS;
}

export function parseViewLayout(config: Record<string, unknown> | undefined): ViewLayout {
  if (!config) return DEFAULT_VIEW_LAYOUT;
  const hidden = Array.isArray(config.hidden)
    ? config.hidden.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    kind: isViewKind(config.kind) ? config.kind : DEFAULT_VIEW_LAYOUT.kind,
    columns: parseColumns(config.columns),
    hidden,
    sortKey: typeof config.sortKey === 'string' ? config.sortKey : undefined,
    sortDesc: config.sortDesc === true,
    widths: typeof config.widths === 'object' && config.widths !== null ? (config.widths as Record<string, number>) : undefined,
    kindFilter: typeof config.kindFilter === 'string' ? config.kindFilter : undefined,
    readerDevice: config.readerDevice === 'tablet' || config.readerDevice === 'phone' ? config.readerDevice : config.readerDevice === 'desktop' ? 'desktop' : undefined,
    height: typeof config.height === 'number' ? config.height : undefined,
    conditions: parseCondition(config.conditions),
    computed: parseComputedColumns(config.computed),
    aggregations: parseAggregations(config.aggregations),
    fieldAliases: parseFieldAliases(config.fieldAliases),
    chart: parseChartSpec(config.chart),
    canvas: parseCanvasLayout(config.canvas),
  };
}

export function serializeViewLayout(layout: ViewLayout): Record<string, unknown> {
  return {
    kind: layout.kind,
    columns: layout.columns,
    hidden: layout.hidden,
    sortKey: layout.sortKey,
    sortDesc: layout.sortDesc,
    widths: layout.widths,
    kindFilter: layout.kindFilter,
    readerDevice: layout.readerDevice,
    height: layout.height,
    conditions: layout.conditions,
    computed: layout.computed,
    aggregations: layout.aggregations,
    fieldAliases: layout.fieldAliases,
    chart: layout.chart,
    canvas: layout.canvas ? serializeCanvasLayout(layout.canvas) : undefined,
  };
}
