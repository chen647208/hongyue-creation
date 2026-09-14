/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 对照视图投影（docs/design/41 §4）：原文段与译文段成行，逐段确认状态可见。
 * 数据取自 Project.translation（侧车），不改正文结构；复用通用表格/卡片视图呈现。
 */
import type { TranslationAlignment } from '@shared/types';

import type { EntityViewData, ViewColumn, ViewRow } from './types';

export const COMPARISON_VIEW_COLUMNS: ViewColumn[] = [
  { key: 'source', label: 'views.col.source', width: 280 },
  { key: 'target', label: 'views.col.target', width: 280 },
  { key: 'confirmed', label: 'views.col.confirmed', width: 96 },
];

/** 对照侧车 → 视图行：每对段落一行，确认状态为布尔值（公式/条件可取数）。 */
export function buildComparisonView(alignment: TranslationAlignment | undefined): EntityViewData {
  const rows: ViewRow[] = (alignment?.pairs ?? []).map((pair, index) => ({
    id: pair.id,
    kind: 'translation-pair',
    title: `#${index + 1}`,
    cells: {
      source: pair.source,
      target: pair.target,
      confirmed: pair.confirmed ? '✓' : '',
    },
    values: {
      source: pair.source,
      target: pair.target,
      confirmed: pair.confirmed,
      order: index + 1,
    },
  }));
  return { columns: COMPARISON_VIEW_COLUMNS, rows, links: [] };
}
