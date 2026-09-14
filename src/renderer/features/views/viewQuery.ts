/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 视图查询的纯函数引擎：条件过滤、计算列与聚合，不触碰实体与存储。 */
import type {
  AggregationKind,
  AggregationResult,
  ComputedColumn,
  EntityViewData,
  QueryCondition,
  ViewAggregation,
  ViewQuery,
  ViewRow,
} from './types';

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readField(row: ViewRow, field: string): unknown {
  if (row.values && Object.prototype.hasOwnProperty.call(row.values, field)) {
    return row.values[field];
  }
  return row.cells[field];
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function compareValues(left: unknown, right: unknown): number {
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  return toText(left).localeCompare(toText(right));
}

/** 求值单个条件节点；缺省条件视为通过。 */
export function evaluateCondition(condition: QueryCondition | undefined, row: ViewRow): boolean {
  if (!condition) return true;
  if (condition.type === 'leaf') {
    const actual = readField(row, condition.field);
    const expected = condition.value;
    switch (condition.operator) {
      case 'eq':
        return toText(actual) === toText(expected);
      case 'neq':
        return toText(actual) !== toText(expected);
      case 'contains':
        return toText(actual).includes(toText(expected));
      case 'notContains':
        return !toText(actual).includes(toText(expected));
      case 'gt':
        return compareValues(actual, expected) > 0;
      case 'gte':
        return compareValues(actual, expected) >= 0;
      case 'lt':
        return compareValues(actual, expected) < 0;
      case 'lte':
        return compareValues(actual, expected) <= 0;
      case 'empty':
        return isEmptyValue(actual);
      case 'notEmpty':
        return !isEmptyValue(actual);
      default:
        return true;
    }
  }
  if (condition.type === 'and') return condition.children.every((child) => evaluateCondition(child, row));
  if (condition.type === 'or') return condition.children.some((child) => evaluateCondition(child, row));
  return !condition.children.some((child) => evaluateCondition(child, row));
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

/**
 * 读出一个操作数：`$名` 取 params 中的数值，其余按字段读取。
 */
function readOperand(row: ViewRow, operand: string, params: Record<string, number> | undefined): unknown {
  if (!operand.startsWith('$')) return readField(row, operand);
  return params?.[operand.slice(1)];
}

/** 对一行按计算列求值，返回显示文本；操作数不足、参数缺失或除零返回空串。 */
export function evaluateFormula(column: ComputedColumn, row: ViewRow): string {
  const invalidParam = column.operands.some((operand) => {
    if (!operand.startsWith('$')) return false;
    const value = column.params?.[operand.slice(1)];
    return typeof value !== 'number' || !Number.isFinite(value);
  });
  if (invalidParam) return '';
  const operands = column.operands.map((operand) => readOperand(row, operand, column.params));
  if (column.operator === 'concat') {
    return operands.map((value) => toText(value)).filter((text) => text !== '').join(' ');
  }
  if (column.operator === 'length') {
    return String(toText(operands[0]).length);
  }
  const numbers = operands.map((value) => toNumber(value)).filter((value): value is number => value !== null);
  if (numbers.length === 0) return '';
  switch (column.operator) {
    case 'add':
      return formatNumber(numbers.reduce((sum, value) => sum + value, 0));
    case 'subtract':
      return formatNumber(numbers.reduce((diff, value) => diff - value));
    case 'multiply':
      return formatNumber(numbers.reduce((product, value) => product * value, 1));
    case 'divide': {
      const head = numbers[0];
      const divisor = numbers.slice(1).reduce((product, value) => product * value, 1);
      if (head === undefined || divisor === 0) return '';
      return formatNumber(head / divisor);
    }
    case 'min':
      return formatNumber(Math.min(...numbers));
    case 'max':
      return formatNumber(Math.max(...numbers));
    default:
      return '';
  }
}

function formatAggregateValue(value: unknown): string {
  if (value && typeof value === 'object') {
    const date = value as { display?: unknown; year?: unknown; month?: unknown; day?: unknown };
    if (typeof date.display === 'string' && date.display !== '') return date.display;
    const parts = [date.year, date.month, date.day].filter((part): part is number => typeof part === 'number');
    if (parts.length > 0) return parts.join('-');
  }
  return toText(value);
}

function toDateKey(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const date = value as { year?: unknown; month?: unknown; day?: unknown };
    if (typeof date.year === 'number') {
      const month = typeof date.month === 'number' ? date.month : 0;
      const day = typeof date.day === 'number' ? date.day : 0;
      return date.year * 10000 + month * 100 + day;
    }
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function aggregateField(rows: ViewRow[], aggregation: ViewAggregation): AggregationResult {
  const kind: AggregationKind = aggregation.kind;
  if (kind === 'count') {
    return { field: aggregation.field, kind, value: rows.length };
  }
  const values = rows.map((row) => readField(row, aggregation.field));
  if (kind === 'sum' || kind === 'avg') {
    const numbers = values.map((value) => toNumber(value)).filter((value): value is number => value !== null);
    const sum = numbers.reduce((total, value) => total + value, 0);
    return { field: aggregation.field, kind, value: kind === 'sum' ? sum : numbers.length > 0 ? sum / numbers.length : 0 };
  }
  if (kind === 'longest') {
    const longest = values.reduce<number>((max, value) => Math.max(max, toText(value).length), 0);
    return { field: aggregation.field, kind, value: longest };
  }
  let best: unknown;
  let bestKey: number | null = null;
  for (const value of values) {
    const key = toDateKey(value);
    if (key === null) continue;
    if (bestKey === null || key > bestKey) {
      bestKey = key;
      best = value;
    }
  }
  return { field: aggregation.field, kind, value: formatAggregateValue(best) };
}

/** 对（已过滤的）行集合求聚合结果。 */
export function aggregateRows(rows: ViewRow[], aggregations: ViewAggregation[] | undefined): AggregationResult[] {
  if (!aggregations || aggregations.length === 0) return [];
  return aggregations.map((aggregation) => aggregateField(rows, aggregation));
}

/** 纯函数投影：过滤行、追加计算列、裁剪关系边；不修改入参。 */
export function applyViewQuery(data: EntityViewData, query: ViewQuery | undefined): EntityViewData {
  const computed = query?.computed ?? [];
  const rows = data.rows
    .filter((row) => evaluateCondition(query?.conditions, row))
    .map((row) => {
      if (computed.length === 0) return row;
      // 按定义顺序求值：后一列可读取前一列刚写入的 cells（口播时长依赖字数计算列）。
      let current: ViewRow = { ...row, cells: { ...row.cells } };
      for (const column of computed) {
        const value = evaluateFormula(column, current);
        current = { ...current, cells: { ...current.cells, [column.key]: value } };
      }
      return current;
    });
  const columns =
    computed.length === 0
      ? data.columns
      : [...data.columns, ...computed.map((column) => ({ key: column.key, label: column.label, width: column.width ?? 140 }))];
  const kept = new Set(rows.map((row) => row.id));
  const links = data.links.filter((link) => kept.has(link.source) && kept.has(link.target));
  return { columns, rows, links };
}
