/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 写作计划纯函数：按阶段增删改与移动，阶段内保持 order。 */
import type { PlanItem, PlanStage } from '@shared/types';

export const PLAN_STAGES: readonly PlanStage[] = ['theme', 'outline', 'chapter', 'revision', 'check'];

export function itemsByStage(items: PlanItem[], stage: PlanStage): PlanItem[] {
  return items.filter((item) => item.stage === stage).sort((a, b) => a.order - b.order);
}

function nextOrder(items: PlanItem[], stage: PlanStage): number {
  const orders = itemsByStage(items, stage).map((item) => item.order);
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

export function addPlanItem(items: PlanItem[], stage: PlanStage, title: string, id: string): PlanItem[] {
  return [...items, { id, title, stage, status: 'todo', order: nextOrder(items, stage) }];
}

export function removePlanItem(items: PlanItem[], id: string): PlanItem[] {
  return items.filter((item) => item.id !== id);
}

export function setPlanStatus(items: PlanItem[], id: string, status: PlanItem['status']): PlanItem[] {
  return items.map((item) => (item.id === id ? { ...item, status } : item));
}

/** 移动到目标阶段的目标位置，目标与来源阶段各自重排 order。 */
export function movePlanItem(items: PlanItem[], id: string, stage: PlanStage, index: number): PlanItem[] {
  const moving = items.find((item) => item.id === id);
  if (!moving) return items;
  const remaining = items.filter((item) => item.id !== id);

  const targetIds = itemsByStage(remaining, stage).map((item) => item.id);
  targetIds.splice(Math.max(0, Math.min(targetIds.length, index)), 0, id);

  const orders = new Map<string, number>();
  targetIds.forEach((itemId, order) => orders.set(itemId, order));
  if (moving.stage !== stage) {
    itemsByStage(remaining, moving.stage).forEach((item, order) => orders.set(item.id, order));
  }

  const result = remaining.map((item) => (orders.has(item.id) ? { ...item, order: orders.get(item.id) ?? item.order } : item));
  result.push({ ...moving, stage, order: orders.get(id) ?? 0 });
  return result;
}

export function togglePlanStatus(items: PlanItem[], id: string): PlanItem[] {
  const item = items.find((entry) => entry.id === id);
  if (!item) return items;
  const next = item.status === 'done' ? 'todo' : 'done';
  return setPlanStatus(items, id, next);
}
