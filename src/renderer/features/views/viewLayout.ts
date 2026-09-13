/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 视图布局的默认值与编解码：config 为自由结构，读取时逐字段校验。 */
import { ENTITY_VIEW_COLUMNS } from './buildEntityView';
import type { ViewColumn, ViewKind, ViewLayout } from './types';

const KINDS: readonly ViewKind[] = ['table', 'card', 'graph', 'list'];

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
  };
}
