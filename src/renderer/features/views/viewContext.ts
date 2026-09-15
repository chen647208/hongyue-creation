/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 视图范围解析：把一条视图定义用与视图面板同源的纯函数投影为「可见实体 + 可读摘要」，
 * 供 AI 上下文注入使用。注入只消费结果，不改视图数据。
 */
import type { ViewContextScope } from '@core/ai';
import type { Project } from '@shared/types';

import type { ViewDefinition } from '@/app/stores/genericModelStore';

import { buildEntityView } from './buildEntityView';
import type { ConditionOperator, QueryCondition } from './types';
import { parseViewLayout } from './viewLayout';
import { applyViewQuery } from './viewQuery';

const OPERATOR_TEXT: Record<ConditionOperator, string> = {
  eq: '=',
  neq: '≠',
  contains: '包含',
  notContains: '不包含',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  empty: '为空',
  notEmpty: '非空',
};

function describeNode(condition: QueryCondition): string {
  if (condition.type === 'leaf') {
    return `${condition.field} ${OPERATOR_TEXT[condition.operator]}${condition.value !== undefined ? ` ${condition.value}` : ''}`;
  }
  const children = condition.children.map(describeNode).filter(Boolean);
  if (condition.type === 'not') return `非（${children.join(' 且 ')}）`;
  return children.join(condition.type === 'and' ? ' 且 ' : ' 或 ');
}

function describeConditions(condition: QueryCondition | undefined): string | undefined {
  if (!condition) return undefined;
  const text = describeNode(condition);
  return text || undefined;
}

/** 从一条视图定义投影出注入范围。 */
export function buildViewContextScope(project: Project, view: ViewDefinition): ViewContextScope {
  const layout = parseViewLayout(view.config);
  const data = buildEntityView(project);
  const projection = applyViewQuery(data, {
    conditions: layout.conditions,
    computed: layout.computed,
    aliases: layout.fieldAliases,
  });
  const rows = layout.kindFilter && layout.kindFilter !== 'all'
    ? projection.rows.filter((row) => row.kind === layout.kindFilter)
    : projection.rows;
  return {
    id: view.id,
    name: view.name,
    entityIds: rows.map((row) => row.id),
    kindFilter: layout.kindFilter && layout.kindFilter !== 'all' ? layout.kindFilter : undefined,
    columns: projection.columns.map((column) => column.key),
    conditionSummary: describeConditions(layout.conditions),
  };
}
