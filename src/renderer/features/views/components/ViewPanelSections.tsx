/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 多视图面板定制区的配置块：条件树编辑、聚合新增与图表通道绑定。 */
import { Plus } from 'lucide-react';
import React, { useState } from 'react';

import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Select';

import type {
  AggregationKind,
  ChartAggregate,
  ChartChannel,
  ChartMark,
  ChartSpec,
  ChartValueType,
  ConditionOperator,
  QueryCondition,
  ViewAggregation,
} from '../types';
import { DEFAULT_CHART_SPEC } from '../viewChart';
import ViewConditionEditor from '../ViewConditionEditor';
import { makeConditionLeaf } from '../viewConditions';

/** 新建条件叶子与聚合的缺省字段。 */
const DEFAULT_CONDITION_FIELD = 'title';
/** 新建条件叶子的缺省操作符。 */
const DEFAULT_CONDITION_OPERATOR: ConditionOperator = 'contains';
/** 新建聚合的缺省聚合方式。 */
const DEFAULT_AGGREGATION_KIND: AggregationKind = 'count';

const CHART_MARKS: readonly ChartMark[] = ['bar', 'point', 'line', 'area'];
const CHART_CHANNELS: readonly ChartChannel[] = ['x', 'y', 'color', 'size', 'shape'];
const CHART_VALUE_TYPES: readonly ChartValueType[] = ['nominal', 'ordinal', 'quantitative', 'temporal'];
const CHART_AGGREGATES: readonly ChartAggregate[] = ['count', 'sum', 'avg', 'min', 'max'];

export interface ViewConditionSectionProps {
  /** 当前条件树；undefined 表示无筛选条件。 */
  conditions: QueryCondition | undefined;
  /** 可选字段：来自行数据的字段键。 */
  availableFields: readonly string[];
  /** 字段显示名。 */
  fieldLabel: (field: string) => string;
  /** 聚合方式显示名：新增聚合行下拉用。 */
  aggregationKindLabels: Record<AggregationKind, string>;
  /** 在 path 指向的分组内插入一个节点（叶子或分组）。 */
  onInsertAt: (path: readonly number[], node: QueryCondition) => void;
  /** 删除 path 指向的节点（叶子或整个分组）。 */
  onRemoveAt: (path: readonly number[]) => void;
  /** 追加一条聚合定义。 */
  onAddAggregation: (aggregation: ViewAggregation) => void;
}

/** 条件树编辑 + 聚合新增：新叶子的字段/操作符/取值与聚合的字段/方式为本组件内部状态。 */
export const ViewConditionSection: React.FC<ViewConditionSectionProps> = ({
  conditions,
  availableFields,
  fieldLabel,
  aggregationKindLabels,
  onInsertAt,
  onRemoveAt,
  onAddAggregation,
}) => {
  const { t } = useTranslation('world');
  const [condField, setCondField] = useState(DEFAULT_CONDITION_FIELD);
  const [condOperator, setCondOperator] = useState<ConditionOperator>(DEFAULT_CONDITION_OPERATOR);
  const [condValue, setCondValue] = useState('');
  const [aggField, setAggField] = useState(DEFAULT_CONDITION_FIELD);
  const [aggKind, setAggKind] = useState<AggregationKind>(DEFAULT_AGGREGATION_KIND);

  return (
    <>
      <ViewConditionEditor
        condition={conditions}
        availableFields={availableFields}
        fieldLabel={fieldLabel}
        field={condField}
        operator={condOperator}
        value={condValue}
        onFieldChange={setCondField}
        onOperatorChange={setCondOperator}
        onValueChange={setCondValue}
        onAddLeaf={(path) => onInsertAt(path, makeConditionLeaf(condField, condOperator, condValue))}
        onAddGroup={(path, type) => onInsertAt(path, { type, children: [] })}
        onRemove={onRemoveAt}
      />
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-muted-foreground">{t('views.query.aggregations')}</span>
        <Select value={aggField} onChange={(event) => setAggField(event.target.value)} className="h-7 w-auto text-2xs" aria-label={t('views.query.field')}>
          {availableFields.map((field) => (
            <option key={field} value={field}>{fieldLabel(field)}</option>
          ))}
        </Select>
        <Select value={aggKind} onChange={(event) => setAggKind(event.target.value as AggregationKind)} className="h-7 w-auto text-2xs" aria-label={t('views.query.aggregationKind')}>
          {(Object.keys(aggregationKindLabels) as AggregationKind[]).map((kind) => (
            <option key={kind} value={kind}>{aggregationKindLabels[kind]}</option>
          ))}
        </Select>
        <Button size="sm" variant="outline" className="h-7" onClick={() => onAddAggregation({ field: aggField, kind: aggKind })}>
          <Plus className="size-3" />
          {t('views.query.addAggregation')}
        </Button>
      </div>
    </>
  );
};

export interface ViewChartSectionProps {
  /** 当前图表声明；undefined 表示未配置，按缺省声明渲染。 */
  chart: ChartSpec | undefined;
  /** 可选字段：来自行数据的字段键。 */
  availableFields: readonly string[];
  /** 字段显示名。 */
  fieldLabel: (field: string) => string;
  /** 图表声明变化回调：整体写回新声明。 */
  onChange: (chart: ChartSpec) => void;
}

/** 图表绑定：图形类型 + 「字段 → 通道」声明；轴与图例由声明派生。 */
export const ViewChartSection: React.FC<ViewChartSectionProps> = ({ chart, availableFields, fieldLabel, onChange }) => {
  const { t } = useTranslation('world');
  const spec = chart ?? DEFAULT_CHART_SPEC;
  const chartValueTypeLabels: Record<ChartValueType, string> = {
    nominal: t('views.chart.types.nominal'),
    ordinal: t('views.chart.types.ordinal'),
    quantitative: t('views.chart.types.quantitative'),
    temporal: t('views.chart.types.temporal'),
  };
  const chartAggregateLabels: Record<ChartAggregate, string> = {
    count: t('views.chart.aggregates.count'),
    sum: t('views.chart.aggregates.sum'),
    avg: t('views.chart.aggregates.avg'),
    min: t('views.chart.aggregates.min'),
    max: t('views.chart.aggregates.max'),
  };
  const chartBinding = (channel: ChartChannel) => spec.bindings.find((binding) => binding.channel === channel);
  const chartBindingField = (channel: ChartChannel): string => chartBinding(channel)?.field ?? '';
  const setChartMark = (mark: ChartMark) => onChange({ mark, bindings: spec.bindings });
  const setChartBinding = (channel: ChartChannel, field: string) => {
    const previous = chartBinding(channel);
    const bindings = spec.bindings.filter((binding) => binding.channel !== channel);
    if (field) bindings.push(previous ? { ...previous, field } : { field, channel });
    onChange({ mark: spec.mark, bindings });
  };
  /** 改通道声明的取值类型：字段不变；选「按取值推断」则从声明中移除 type，回到引擎推断。 */
  const setChartValueType = (channel: ChartChannel, type: ChartValueType | '') => {
    const bindings = spec.bindings.map((binding) => {
      if (binding.channel !== channel) return binding;
      if (type === '') {
        const rest = { ...binding };
        delete rest.type;
        return rest;
      }
      return { ...binding, type };
    });
    onChange({ mark: spec.mark, bindings });
  };
  /** 改通道声明的聚合方式：字段不变；聚合只对量化通道（y）生效，缺省即按 x 计数。 */
  const setChartAggregate = (channel: ChartChannel, aggregate: ChartAggregate | '') => {
    const bindings = spec.bindings.map((binding) => {
      if (binding.channel !== channel) return binding;
      if (aggregate === '') {
        const rest = { ...binding };
        delete rest.aggregate;
        return rest;
      }
      return { ...binding, aggregate };
    });
    onChange({ mark: spec.mark, bindings });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
      <span className="text-muted-foreground">{t('views.chart.title')}</span>
      <Select value={spec.mark} onChange={(event) => setChartMark(event.target.value as ChartMark)} className="h-7 w-auto text-2xs" aria-label={t('views.chart.mark')}>
        {CHART_MARKS.map((mark) => (
          <option key={mark} value={mark}>{t(`views.chart.marks.${mark}`)}</option>
        ))}
      </Select>
      {CHART_CHANNELS.map((channel) => (
        <label key={channel} className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground">{t(`views.chart.channels.${channel}`)}</span>
          <Select
            value={chartBindingField(channel)}
            onChange={(event) => setChartBinding(channel, event.target.value)}
            className="h-7 w-auto text-2xs"
            aria-label={t(`views.chart.channels.${channel}`)}
          >
            <option value="">{t('views.chart.unbound')}</option>
            {availableFields.map((field) => (
              <option key={field} value={field}>{fieldLabel(field)}</option>
            ))}
          </Select>
          {channel === 'x' && chartBindingField('x') !== '' && (
            <Select
              value={chartBinding('x')?.type ?? ''}
              onChange={(event) => setChartValueType('x', event.target.value as ChartValueType | '')}
              className="h-7 w-auto text-2xs"
              aria-label={t('views.chart.valueType')}
            >
              <option value="">{t('views.chart.typeAuto')}</option>
              {CHART_VALUE_TYPES.map((type) => (
                <option key={type} value={type}>{chartValueTypeLabels[type]}</option>
              ))}
            </Select>
          )}
          {channel === 'y' && chartBindingField('y') !== '' && (
            <Select
              value={chartBinding('y')?.aggregate ?? 'count'}
              onChange={(event) => setChartAggregate('y', event.target.value as ChartAggregate)}
              className="h-7 w-auto text-2xs"
              aria-label={t('views.chart.aggregate')}
            >
              {CHART_AGGREGATES.map((aggregate) => (
                <option key={aggregate} value={aggregate}>{chartAggregateLabels[aggregate]}</option>
              ))}
            </Select>
          )}
        </label>
      ))}
    </div>
  );
};
