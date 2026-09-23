/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import type { ChartSpec, EntityViewData, ViewRow } from '../types';
import { projectChart } from '../viewChart';
import { DEFAULT_VIEW_LAYOUT,parseViewLayout, serializeViewLayout } from '../viewLayout';

function row(id: string, title: string, values: Record<string, unknown>): ViewRow {
  return { id, kind: 'character', title, cells: { title }, values };
}

function data(): EntityViewData {
  return {
    columns: [{ key: 'title', label: 'views.col.title' }],
    rows: [
      row('a1', '甲', { role: '主角', age: 30, faction: '白鸦', chapter: 1 }),
      row('a2', '乙', { role: '配角', age: 20, faction: '白鸦', chapter: 2 }),
      row('a3', '丙', { role: '主角', age: 25, faction: '黑蛇', chapter: 3 }),
    ],
    links: [],
  };
}

describe('projectChart：字段→通道声明', () => {
  it('逐行投影并派生量化轴与类别图例', () => {
    const spec: ChartSpec = {
      mark: 'point',
      bindings: [
        { field: 'chapter', channel: 'x', type: 'quantitative' },
        { field: 'age', channel: 'y', type: 'quantitative' },
        { field: 'faction', channel: 'color', type: 'nominal' },
        { field: 'age', channel: 'size' },
      ],
    };
    const projection = projectChart(data(), spec);
    expect(projection.mark).toBe('point');
    expect(projection.data).toHaveLength(3);
    expect(projection.data[0]).toMatchObject({ id: 'a1', x: 1, y: 30, size: 30, color: '白鸦' });
    expect(projection.axes).toEqual([
      { channel: 'x', field: 'chapter', type: 'quantitative', domain: [1, 3] },
      { channel: 'y', field: 'age', type: 'quantitative', domain: [20, 30] },
    ]);
    expect(projection.legends).toEqual([{ channel: 'color', field: 'faction', categories: ['白鸦', '黑蛇'] }]);
  });

  it('缺少 y 声明时按 x 计数分组', () => {
    const spec: ChartSpec = { mark: 'bar', bindings: [{ field: 'role', channel: 'x', type: 'nominal' }] };
    const projection = projectChart(data(), spec);
    expect(projection.data).toHaveLength(2);
    expect(projection.data.find((datum) => datum.x === '主角')?.y).toBe(2);
    expect(projection.data.find((datum) => datum.x === '配角')?.y).toBe(1);
    expect(projection.axes).toEqual([{ channel: 'x', field: 'role', type: 'nominal', domain: ['主角', '配角'] }]);
  });

  it('y 通道带聚合时按 x 分组求和', () => {
    const spec: ChartSpec = {
      mark: 'bar',
      bindings: [
        { field: 'role', channel: 'x', type: 'nominal' },
        { field: 'age', channel: 'y', type: 'quantitative', aggregate: 'sum' },
      ],
    };
    const projection = projectChart(data(), spec);
    expect(projection.data.find((datum) => datum.x === '主角')?.y).toBe(55);
    expect(projection.data.find((datum) => datum.x === '配角')?.y).toBe(20);
    expect(projection.axes.find((axis) => axis.channel === 'y')?.domain).toEqual([20, 55]);
  });

  it('未声明时用默认声明：名称作类别横轴', () => {
    const projection = projectChart(data(), undefined);
    expect(projection.axes[0]).toMatchObject({ field: 'title', type: 'nominal' });
    expect(projection.data.map((datum) => datum.x)).toEqual(['甲', '乙', '丙']);
  });

  it('量化颜色通道不产生类别图例', () => {
    const spec: ChartSpec = {
      mark: 'point',
      bindings: [
        { field: 'chapter', channel: 'x' },
        { field: 'age', channel: 'y' },
        { field: 'age', channel: 'color', type: 'quantitative' },
      ],
    };
    expect(projectChart(data(), spec).legends).toEqual([]);
  });
});

describe('viewLayout 图表声明编解码', () => {
  it('图表声明往返保留', () => {
    const layout = {
      ...DEFAULT_VIEW_LAYOUT,
      kind: 'chart' as const,
      chart: {
        mark: 'line' as const,
        bindings: [
          { field: 'chapter', channel: 'x' as const, type: 'quantitative' as const },
          { field: 'age', channel: 'y' as const, type: 'quantitative' as const, aggregate: 'avg' as const },
        ],
      },
    };
    expect(parseViewLayout(serializeViewLayout(layout)).chart).toEqual(layout.chart);
  });

  it('非法声明丢弃，合法声明缺 mark 时回落柱状', () => {
    expect(parseViewLayout({ chart: { mark: 'pie', bindings: [{ field: '', channel: 'x' }] } }).chart).toBeUndefined();
    const parsed = parseViewLayout({ chart: { bindings: [{ field: 'age', channel: 'y' }] } });
    expect(parsed.chart).toEqual({ mark: 'bar', bindings: [{ field: 'age', channel: 'y' }] });
  });

  it('同一通道只保留首条声明', () => {
    const parsed = parseViewLayout({
      chart: { mark: 'bar', bindings: [{ field: 'a', channel: 'x' }, { field: 'b', channel: 'x' }] },
    });
    expect(parsed.chart?.bindings).toEqual([{ field: 'a', channel: 'x' }]);
  });

  it('type/aggregate 缺席时往返不补默认值', () => {
    const parsed = parseViewLayout({
      chart: { mark: 'bar', bindings: [{ field: 'role', channel: 'x' }, { field: 'age', channel: 'y' }] },
    });
    expect(parsed.chart?.bindings).toEqual([{ field: 'role', channel: 'x' }, { field: 'age', channel: 'y' }]);
  });

  it('显式 y 聚合与 x 维度类型往返不丢', () => {
    const layout = {
      ...DEFAULT_VIEW_LAYOUT,
      chart: {
        mark: 'line' as const,
        bindings: [
          { field: 'year', channel: 'x' as const, type: 'temporal' as const },
          { field: 'age', channel: 'y' as const, aggregate: 'max' as const },
        ],
      },
    };
    expect(parseViewLayout(serializeViewLayout(layout)).chart).toEqual(layout.chart);
  });
});
