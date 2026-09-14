/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 视图引擎的类型：同一份行数据可由表格/卡片/图/大纲/读者五种视图呈现。 */
export type ViewKind = 'table' | 'card' | 'graph' | 'list' | 'reader';

/** 一列：key 决定取 row.cells[key]，label 为 i18n 键或计算列的用户标签。 */
export interface ViewColumn {
  key: string;
  label: string;
  width?: number;
}

/** 一行：cells 为已拍平的显示文本；values 为原始字段（条件与公式取数用）。 */
export interface ViewRow {
  id: string;
  kind: string;
  title: string;
  cells: Record<string, string>;
  values?: Record<string, unknown>;
}

/** 集合条件的比较操作符。 */
export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'notContains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'empty'
  | 'notEmpty';

/** 条件叶子：字段、操作符与比较值。 */
export interface QueryLeaf {
  type: 'leaf';
  field: string;
  operator: ConditionOperator;
  value?: string | number;
}

/** 条件分组：与或非，children 可再嵌套分组。 */
export interface QueryGroup {
  type: 'and' | 'or' | 'not';
  children: QueryCondition[];
}

/** 集合条件：叶子或分组，可序列化进 ViewDefinition.config。 */
export type QueryCondition = QueryLeaf | QueryGroup;

/** 计算列的操作符：四则、极值、文本拼接与文本长度。 */
export type FormulaOperator = 'add' | 'subtract' | 'multiply' | 'divide' | 'min' | 'max' | 'concat' | 'length';

/**
 * 计算列：对 operands 中的字段做简单计算，结果写入 row.cells[key]。
 * operands 写字段名取行内值；写 `$参数名` 取 params 中的数值（语速一类不内置常数）。
 */
export interface ComputedColumn {
  key: string;
  label: string;
  operator: FormulaOperator;
  operands: string[];
  /** 视图/用户参数（数值），操作数 `$名` 在此取值。 */
  params?: Record<string, number>;
  width?: number;
}

/** 聚合方式：计数、求和、均值、最长文本长度、最新日期。 */
export type AggregationKind = 'count' | 'sum' | 'avg' | 'longest' | 'latest';

/** 聚合定义：对某字段按 kind 汇总。 */
export interface ViewAggregation {
  field: string;
  kind: AggregationKind;
  label?: string;
}

/** 聚合结果：供视图面板展示。 */
export interface AggregationResult {
  field: string;
  kind: AggregationKind;
  value: number | string;
}

/** 视图查询：集合条件、计算列与聚合的合集。 */
export interface ViewQuery {
  conditions?: QueryCondition;
  computed?: ComputedColumn[];
  aggregations?: ViewAggregation[];
}

/** 图中一条边：source/target 为行 id。 */
export interface ViewLink {
  source: string;
  target: string;
  label?: string;
}

/** 待展示的数据集：列、行与关系边。 */
export interface EntityViewData {
  columns: ViewColumn[];
  rows: ViewRow[];
  links: ViewLink[];
}

/** 视图布局：持久化到 ViewDefinition.config。 */
export interface ViewLayout {
  kind: ViewKind;
  columns: ViewColumn[];
  hidden: string[];
  sortKey?: string;
  sortDesc?: boolean;
  widths?: Record<string, number>;
  /** 实体类型筛选（`kind` 值；缺席=全部）。 */
  kindFilter?: string;
  /** 读者视图的设备宽度。 */
  readerDevice?: 'desktop' | 'tablet' | 'phone';
  /** 视图内容区高度（拖拽调整，单位 px）。 */
  height?: number;
  /** 集合条件（缺席=不过滤）。 */
  conditions?: QueryCondition;
  /** 计算列（缺席=无计算列）。 */
  computed?: ComputedColumn[];
  /** 聚合定义（缺席=无聚合）。 */
  aggregations?: ViewAggregation[];
}
