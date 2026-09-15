/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 图表视图的纯函数投影（docs/design/47 §3）：把「字段→通道」声明编译为
 * 数据点、轴与图例。不触达渲染与存储；渲染器按需加载消费本投影。
 */
import type { ChartAggregate, ChartMark, ChartSpec, ChartValueType, EntityViewData, ViewRow } from './types';

/** 未声明时的默认图表：名称作类别横轴、按计数出柱。 */
export const DEFAULT_CHART_SPEC: ChartSpec = {
  mark: 'bar',
  bindings: [{ field: 'title', channel: 'x', type: 'nominal' }],
};

/** 编译后的数据点：每个通道一项，缺席为 null。 */
export interface ChartDatum {
  id: string;
  title: string;
  kind: string;
  x: number | string | null;
  y: number | string | null;
  size: number | null;
  color: string | null;
  shape: string | null;
}

export type ChartAxisType = 'nominal' | 'ordinal' | 'quantitative' | 'temporal';

/** 由声明派生的轴：量化轴域为 [min,max]，类别轴域为去重取值序列。 */
export interface ChartAxis {
  channel: 'x' | 'y';
  field: string;
  type: ChartAxisType;
  domain: number[] | string[];
}

/** 由声明派生的图例：只对类别型颜色/形状通道生成。 */
export interface ChartLegend {
  channel: 'color' | 'shape';
  field: string;
  categories: string[];
}

export interface ChartProjection {
  mark: ChartMark;
  data: ChartDatum[];
  axes: ChartAxis[];
  legends: ChartLegend[];
}

function readField(row: ViewRow, field: string): unknown {
  if (row.values && Object.prototype.hasOwnProperty.call(row.values, field)) return row.values[field];
  return row.cells[field];
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function isQuantitative(values: readonly (number | string | null)[]): boolean {
  const present = values.filter((value) => value !== null && value !== '');
  return present.length > 0 && present.every((value) => typeof value === 'number');
}

function resolveType(values: readonly (number | string | null)[], declared: ChartValueType | undefined): ChartAxisType {
  if (declared) return declared;
  return isQuantitative(values) ? 'quantitative' : 'nominal';
}

function distinctText(values: readonly (number | string | null)[]): string[] {
  const seen: string[] = [];
  for (const value of values) {
    const text = toText(value);
    if (!seen.includes(text)) seen.push(text);
  }
  return seen;
}

function aggregate(values: readonly (number | null)[], kind: ChartAggregate): number {
  if (kind === 'count') return values.length;
  const numbers = values.filter((value): value is number => value !== null);
  if (numbers.length === 0) return 0;
  switch (kind) {
    case 'sum':
      return numbers.reduce((total, value) => total + value, 0);
    case 'avg':
      return numbers.reduce((total, value) => total + value, 0) / numbers.length;
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
    default:
      return values.length;
  }
}

function channelValue(row: ViewRow, field: string | undefined, quantitative: boolean): number | string | null {
  if (!field) return null;
  const raw = readField(row, field);
  if (!quantitative) return toText(raw);
  return toNumber(raw);
}

function makeDatum(row: ViewRow, xField: string | undefined, xQuant: boolean, yField: string | undefined, yQuant: boolean, sizeField: string | undefined, colorField: string | undefined, shapeField: string | undefined): ChartDatum {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    x: channelValue(row, xField, xQuant),
    y: channelValue(row, yField, yQuant),
    size: sizeField ? toNumber(readField(row, sizeField)) : null,
    color: colorField ? toText(readField(row, colorField)) : null,
    shape: shapeField ? toText(readField(row, shapeField)) : null,
  };
}

/**
 * 把行数据按声明编译为图表投影。
 * - 有 y 聚合或缺省 y 时，按 x 分组聚合（缺省 y 即按 x 计数）。
 * - 轴类型取声明；未声明时全数值判为 quantitative，否则 nominal。
 * - 图例只为类别型 color/shape 通道生成。
 */
export function projectChart(data: EntityViewData, spec: ChartSpec | undefined): ChartProjection {
  const chart = spec ?? DEFAULT_CHART_SPEC;
  const xBinding = chart.bindings.find((binding) => binding.channel === 'x');
  const yBinding = chart.bindings.find((binding) => binding.channel === 'y');
  const sizeBinding = chart.bindings.find((binding) => binding.channel === 'size');
  const colorBinding = chart.bindings.find((binding) => binding.channel === 'color');
  const shapeBinding = chart.bindings.find((binding) => binding.channel === 'shape');

  const rawX = xBinding ? data.rows.map((row) => toNumber(readField(row, xBinding.field)) ?? toText(readField(row, xBinding.field))) : [];
  const rawY = yBinding ? data.rows.map((row) => toNumber(readField(row, yBinding.field)) ?? toText(readField(row, yBinding.field))) : [];
  const xQuant = resolveType(rawX, xBinding?.type) === 'quantitative';
  const yQuant = yBinding ? resolveType(rawY, yBinding.type) === 'quantitative' : true;

  const group = !!xBinding && (!!yBinding?.aggregate || !yBinding);
  const data$: ChartDatum[] = [];
  if (group) {
    const buckets = new Map<string, { x: number | string | null; rows: ViewRow[]; values: (number | null)[] }>();
    for (const row of data.rows) {
      const x = channelValue(row, xBinding?.field, xQuant);
      const key = toText(x);
      const bucket = buckets.get(key) ?? { x, rows: [], values: [] };
      bucket.rows.push(row);
      bucket.values.push(yBinding ? toNumber(readField(row, yBinding.field)) : 1);
      buckets.set(key, bucket);
    }
    for (const [key, bucket] of buckets) {
      const first = bucket.rows[0];
      if (!first) continue;
      data$.push({
        id: `group:${key}`,
        title: key,
        kind: first.kind,
        x: bucket.x,
        y: aggregate(bucket.values, yBinding?.aggregate ?? 'count'),
        size: sizeBinding ? toNumber(readField(first, sizeBinding.field)) : null,
        color: colorBinding ? toText(readField(first, colorBinding.field)) : null,
        shape: shapeBinding ? toText(readField(first, shapeBinding.field)) : null,
      });
    }
  } else {
    for (const row of data.rows) {
      data$.push(makeDatum(row, xBinding?.field, xQuant, yBinding?.field, yQuant, sizeBinding?.field, colorBinding?.field, shapeBinding?.field));
    }
  }

  const axes: ChartAxis[] = [];
  if (xBinding) {
    const values = data$.map((datum) => datum.x);
    axes.push({ channel: 'x', field: xBinding.field, type: resolveType(values, xBinding.type), domain: axisDomain(values, resolveType(values, xBinding.type)) });
  }
  if (yBinding) {
    const values = data$.map((datum) => datum.y);
    axes.push({ channel: 'y', field: yBinding.field, type: resolveType(values, yBinding.type), domain: axisDomain(values, resolveType(values, yBinding.type)) });
  }

  const legends: ChartLegend[] = [];
  for (const binding of chart.bindings) {
    if (binding.channel !== 'color' && binding.channel !== 'shape') continue;
    const values = data$.map((datum) => (binding.channel === 'color' ? datum.color : datum.shape));
    const type = resolveType(values, binding.type);
    if (type === 'quantitative' || type === 'temporal') continue;
    legends.push({ channel: binding.channel, field: binding.field, categories: distinctText(values) });
  }

  return { mark: chart.mark, data: data$, axes, legends };
}

function axisDomain(values: readonly (number | string | null)[], type: ChartAxisType): number[] | string[] {
  if (type === 'quantitative' || type === 'temporal') {
    const numbers = values.filter((value): value is number => typeof value === 'number');
    if (numbers.length === 0) return [0, 1];
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    return min === max ? [min, min + 1] : [min, max];
  }
  return distinctText(values).filter((value) => value !== '');
}
