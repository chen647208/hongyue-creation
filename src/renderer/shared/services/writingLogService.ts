/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 码字日志：从修订记录推算每日新增字数（按节点正增量累计）。 */
import { repository, type RevisionStat } from './repository';

export type { RevisionStat } from './repository';

export interface DailyWords {
  /** 本地日期 YYYY-MM-DD。 */
  date: string;
  words: number;
}

export function toDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function buildDailyWords(stats: RevisionStat[]): DailyWords[] {
  const lastByNode = new Map<string, number>();
  const byDate = new Map<string, number>();
  for (const stat of [...stats].sort((a, b) => a.createdAt - b.createdAt)) {
    const previous = lastByNode.get(stat.nodeId) ?? 0;
    const delta = Math.max(0, stat.length - previous);
    lastByNode.set(stat.nodeId, stat.length);
    const date = toDateKey(stat.createdAt);
    byDate.set(date, (byDate.get(date) ?? 0) + delta);
  }
  return [...byDate.entries()].map(([date, words]) => ({ date, words })).sort((a, b) => a.date.localeCompare(b.date));
}

/** 最近 n 天的连续序列（含无记录日）。 */
export function recentDays(daily: DailyWords[], n: number, now = new Date()): DailyWords[] {
  const byDate = new Map(daily.map((entry) => [entry.date, entry.words]));
  const result: DailyWords[] = [];
  for (let offset = n - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    const key = toDateKey(date.getTime());
    result.push({ date: key, words: byDate.get(key) ?? 0 });
  }
  return result;
}

export async function loadDailyWords(bookId: string): Promise<DailyWords[]> {
  const stats = (await repository.loadRevisionStats?.(bookId)) ?? [];
  return buildDailyWords(stats);
}
