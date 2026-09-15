/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 图表视图渲染器：消费 viewChart 的纯函数投影，按需加载，不进默认视图包。 */
import React from 'react';

import type { ChartAxis, ChartDatum, ChartProjection } from './viewChart';

const WIDTH = 800;
const HEIGHT = 420;
const PAD = { top: 16, right: 24, bottom: 44, left: 60 };

/** 语义色板：颜色通道的分类落到图表色变量，不硬编码色值。 */
const PALETTE = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)'];

function categoryIndex(legend: { categories: string[] } | undefined, value: string | null): number {
  if (!legend || value === null) return 0;
  const index = legend.categories.indexOf(value);
  return index < 0 ? 0 : index;
}

function linearScale(domain: number[], range: [number, number]): (value: number) => number {
  const min = domain.length === 2 ? (domain[0] ?? 0) : 0;
  const max = domain.length === 2 ? (domain[1] ?? 1) : 1;
  const span = max - min || 1;
  return (value) => range[0] + ((value - min) / span) * (range[1] - range[0]);
}

function bandScale(domain: string[], range: [number, number]): { position: (value: string) => number; width: number } {
  const count = domain.length || 1;
  const step = (range[1] - range[0]) / count;
  return {
    position: (value) => {
      const index = domain.indexOf(value);
      return range[0] + (index < 0 ? 0 : index) * step + step / 2;
    },
    width: step,
  };
}

interface ViewChartProps {
  projection: ChartProjection;
  emptyText: string;
}

const ViewChart: React.FC<ViewChartProps> = ({ projection, emptyText }) => {
  if (projection.data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  const xAxis = projection.axes.find((axis) => axis.channel === 'x');
  const yAxis = projection.axes.find((axis) => axis.channel === 'y');
  const colorLegend = projection.legends.find((legend) => legend.channel === 'color');
  const shapeLegend = projection.legends.find((legend) => legend.channel === 'shape');

  const plotLeft = PAD.left;
  const plotRight = WIDTH - PAD.right;
  const plotTop = PAD.top;
  const plotBottom = HEIGHT - PAD.bottom;

  const xBand = xAxis && xAxis.type !== 'quantitative' && xAxis.type !== 'temporal'
    ? bandScale(xAxis.domain as string[], [plotLeft, plotRight])
    : null;
  const xLinear = xAxis && !xBand ? linearScale(xAxis.domain as number[], [plotLeft, plotRight]) : null;
  const yQuantitative = !yAxis || yAxis.type === 'quantitative' || yAxis.type === 'temporal';
  const yLinear = yQuantitative && yAxis ? linearScale(yAxis.domain as number[], [plotBottom, plotTop]) : null;
  const yBand = yAxis && !yQuantitative ? bandScale(yAxis.domain as string[], [plotTop, plotBottom]) : null;

  const sizeValues = projection.data.map((datum) => datum.size).filter((value): value is number => value !== null);
  const sizeMin = sizeValues.length ? Math.min(...sizeValues) : 0;
  const sizeMax = sizeValues.length ? Math.max(...sizeValues) : 1;
  const sizeScale = (value: number | null): number => {
    if (value === null || sizeValues.length === 0) return 5;
    const span = sizeMax - sizeMin || 1;
    return 4 + ((value - sizeMin) / span) * 10;
  };

  const xOf = (datum: ChartDatum): number | null => {
    if (datum.x === null) return null;
    if (xBand) return xBand.position(String(datum.x));
    if (xLinear && typeof datum.x === 'number') return xLinear(datum.x);
    return null;
  };
  const yOf = (datum: ChartDatum): number | null => {
    if (datum.y === null) return null;
    if (yBand) return yBand.position(String(datum.y));
    if (yLinear && typeof datum.y === 'number') return yLinear(datum.y);
    return null;
  };

  const baseline = yAxis && yQuantitative && typeof yAxis.domain[0] === 'number'
    ? linearScale(yAxis.domain as number[], [plotBottom, plotTop])(0)
    : plotBottom;

  const linePoints = projection.mark === 'line' || projection.mark === 'area'
    ? [...projection.data]
        .map((datum) => ({ datum, x: xOf(datum), y: yOf(datum) }))
        .filter((item): item is { datum: ChartDatum; x: number; y: number } => item.x !== null && item.y !== null)
        .sort((left, right) => left.x - right.x)
    : [];

  const axisTicks = (axis: ChartAxis | undefined, orientation: 'x' | 'y'): Array<{ key: string; position: number; label: string }> => {
    if (!axis) return [];
    if (axis.type === 'quantitative' || axis.type === 'temporal') {
      const domain = axis.domain as number[];
      const scale = orientation === 'x'
        ? linearScale(domain, [plotLeft, plotRight])
        : linearScale(domain, [plotBottom, plotTop]);
      const count = 5;
      const lower = domain[0] ?? 0;
      const upper = domain[1] ?? lower + 1;
      const tickValues = Array.from({ length: count }, (_, index) => lower + ((upper - lower) / (count - 1)) * index);
      return tickValues.map((value) => ({ key: String(value), position: scale(value), label: String(Math.round(value * 100) / 100) }));
    }
    const scale = orientation === 'x' ? bandScale(axis.domain as string[], [plotLeft, plotRight]) : bandScale(axis.domain as string[], [plotTop, plotBottom]);
    return (axis.domain as string[]).map((value) => ({ key: value, position: scale.position(value), label: value.length > 8 ? `${value.slice(0, 8)}…` : value }));
  };

  return (
    <div className="h-full overflow-auto rounded-lg border border-border bg-card">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" role="img" aria-label={xAxis ? `${xAxis.field} / ${yAxis?.field ?? ''}` : ''}>
        <line x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} stroke="var(--color-border)" />
        <line x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} stroke="var(--color-border)" />
        {axisTicks(xAxis, 'x').map((tick) => (
          <g key={`x-${tick.key}`}>
            <line x1={tick.position} y1={plotBottom} x2={tick.position} y2={plotBottom + 4} stroke="var(--color-border)" />
            <text x={tick.position} y={plotBottom + 16} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)">{tick.label}</text>
          </g>
        ))}
        {axisTicks(yAxis, 'y').map((tick) => (
          <g key={`y-${tick.key}`}>
            <line x1={plotLeft - 4} y1={tick.position} x2={plotLeft} y2={tick.position} stroke="var(--color-border)" />
            <text x={plotLeft - 8} y={tick.position + 3} textAnchor="end" fontSize={10} fill="var(--color-muted-foreground)">{tick.label}</text>
          </g>
        ))}
        {projection.mark === 'bar' &&
          projection.data.map((datum) => {
            const x = xOf(datum);
            const y = yOf(datum);
            if (x === null || y === null) return null;
            const barWidth = xBand ? Math.max(6, xBand.width * 0.6) : 14;
            const color = PALETTE[categoryIndex(colorLegend, datum.color) % PALETTE.length];
            const top = Math.min(y, baseline);
            const height = Math.abs(y - baseline);
            return <rect key={datum.id} x={x - barWidth / 2} y={top} width={barWidth} height={height} fill={color} opacity={0.85} rx={2}><title>{`${datum.title}：${String(datum.y)}`}</title></rect>;
          })}
        {projection.mark === 'area' && linePoints.length > 1 && (
          <path
            d={[
              `M ${linePoints[0]?.x ?? plotLeft} ${baseline}`,
              ...linePoints.map((point) => `L ${point.x} ${point.y}`),
              `L ${linePoints[linePoints.length - 1]?.x ?? plotRight} ${baseline}`,
              'Z',
            ].join(' ')}
            fill={PALETTE[0]}
            opacity={0.25}
          />
        )}
        {projection.mark === 'line' && linePoints.length > 1 && (
          <polyline points={linePoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={PALETTE[0]} strokeWidth={2} />
        )}
        {(projection.mark === 'point' || projection.mark === 'line' || projection.mark === 'area') &&
          projection.data.map((datum) => {
            const x = xOf(datum);
            const y = yOf(datum);
            if (x === null || y === null) return null;
            const color = PALETTE[categoryIndex(colorLegend, datum.color) % PALETTE.length];
            const shape = shapeLegend ? categoryIndex(shapeLegend, datum.shape) % 3 : 0;
            return (
              <g key={datum.id}>
                <circle cx={x} cy={y} r={sizeScale(datum.size)} fill={color} opacity={0.85} />
                {shape === 1 && <rect x={x - 3} y={y - 3} width={6} height={6} fill="var(--color-card)" />}
                {shape === 2 && <line x1={x - 4} y1={y} x2={x + 4} y2={y} stroke="var(--color-card)" strokeWidth={2} />}
                <title>{`${datum.title}：${String(datum.y)}`}</title>
              </g>
            );
          })}
      </svg>
    </div>
  );
};

export default ViewChart;
