/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 视图引擎的类型：同一份行数据可由表格/卡片/图/大纲四种视图呈现。 */
export type ViewKind = 'table' | 'card' | 'graph' | 'list';

/** 一列：key 决定取 row.cells[key]，label 为 i18n 键。 */
export interface ViewColumn {
  key: string;
  label: string;
  width?: number;
}

/** 一行：cells 为已拍平的显示文本；kind 用于分组、着色与图标。 */
export interface ViewRow {
  id: string;
  kind: string;
  title: string;
  cells: Record<string, string>;
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
}
