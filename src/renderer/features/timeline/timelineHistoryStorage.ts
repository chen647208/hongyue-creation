/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 时间线撤销栈的会话侧车持久化：按书 id 存 sessionStorage，面板卸载再挂载可续上撤销/重做。
 * 取舍：章节全量快照体积大，磁盘侧车写放大明显且跨重启后可能已被外部改动覆盖，
 * 因此只做会话内（窗口存活期）持久化；载入时校验当前状态与所存栈顶一致，不一致即弃用新起，
 * 避免撤销跳到已被外部写入覆盖的旧状态。
 */
import type { Chapter } from '@shared/types';

import { sameChapters, TimelineHistory, type TimelineHistoryState } from './timelineOperations';

export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 单条持久化字符串上限：超过则跳过本次落盘，内存栈不受影响。 */
export const MAX_PERSISTED_HISTORY_CHARS = 1_500_000;
export const TIMELINE_HISTORY_KEY_PREFIX = 'hongyue:timeline-history:';

export function timelineHistoryKey(projectId: string): string {
  return `${TIMELINE_HISTORY_KEY_PREFIX}${projectId}`;
}

function resolveStorage(storage?: HistoryStorage): HistoryStorage | null {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage;
  return null;
}

/**
 * 载入某书的撤销栈：仅在栈顶状态与当前章节等价时返回，否则返回 null（调用方新起空栈）。
 */
export function loadTimelineHistory(
  projectId: string,
  liveChapters: Chapter[],
  storage?: HistoryStorage,
): TimelineHistory | null {
  const store = resolveStorage(storage);
  if (!store) return null;
  const raw = store.getItem(timelineHistoryKey(projectId));
  if (!raw) return null;
  try {
    const state = JSON.parse(raw) as TimelineHistoryState;
    if (!state || !Array.isArray(state.baseline) || !Array.isArray(state.edits)) return null;
    const history = TimelineHistory.fromJSON(state);
    return sameChapters(history.current, liveChapters) ? history : null;
  } catch {
    return null;
  }
}

/** 保存撤销栈；无存储或超出体积上限时返回 false（不抛出）。 */
export function saveTimelineHistory(
  projectId: string,
  history: TimelineHistory,
  storage?: HistoryStorage,
): boolean {
  const store = resolveStorage(storage);
  if (!store) return false;
  try {
    const raw = JSON.stringify(history.toJSON());
    if (raw.length > MAX_PERSISTED_HISTORY_CHARS) return false;
    store.setItem(timelineHistoryKey(projectId), raw);
    return true;
  } catch {
    return false;
  }
}

export function clearTimelineHistory(projectId: string, storage?: HistoryStorage): void {
  const store = resolveStorage(storage);
  store?.removeItem(timelineHistoryKey(projectId));
}
