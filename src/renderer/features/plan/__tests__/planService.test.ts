/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { addPlanItem, itemsByStage, movePlanItem, removePlanItem, togglePlanStatus } from '../planService';

describe('planService', () => {
  it('按阶段追加并递增 order', () => {
    let items = addPlanItem([], 'outline', 'A', '1');
    items = addPlanItem(items, 'outline', 'B', '2');
    items = addPlanItem(items, 'theme', 'C', '3');
    expect(itemsByStage(items, 'outline').map((item) => item.title)).toEqual(['A', 'B']);
    expect(itemsByStage(items, 'outline').map((item) => item.order)).toEqual([0, 1]);
    expect(itemsByStage(items, 'theme').map((item) => item.title)).toEqual(['C']);
  });

  it('勾选完成并在再次勾选时回到待办', () => {
    let items = addPlanItem([], 'check', 'A', '1');
    items = togglePlanStatus(items, '1');
    expect(items[0]?.status).toBe('done');
    items = togglePlanStatus(items, '1');
    expect(items[0]?.status).toBe('todo');
  });

  it('移动到目标阶段并在两段内重排 order', () => {
    let items = addPlanItem([], 'outline', 'A', '1');
    items = addPlanItem(items, 'outline', 'B', '2');
    items = addPlanItem(items, 'chapter', 'C', '3');
    items = movePlanItem(items, '2', 'chapter', 0);
    expect(itemsByStage(items, 'outline').map((item) => item.title)).toEqual(['A']);
    expect(itemsByStage(items, 'chapter').map((item) => item.title)).toEqual(['B', 'C']);
    expect(itemsByStage(items, 'outline').map((item) => item.order)).toEqual([0]);
    expect(itemsByStage(items, 'chapter').map((item) => item.order)).toEqual([0, 1]);
  });

  it('删除条目', () => {
    let items = addPlanItem([], 'outline', 'A', '1');
    items = addPlanItem(items, 'outline', 'B', '2');
    expect(removePlanItem(items, '1').map((item) => item.id)).toEqual(['2']);
  });
});
