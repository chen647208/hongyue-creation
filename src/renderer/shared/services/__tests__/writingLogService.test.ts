/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { buildDailyWords, recentDays, toDateKey } from '../writingLogService';

describe('writingLogService', () => {
  it('按节点正增量累计每日字数', () => {
    const day1 = new Date(2026, 0, 1, 10).getTime();
    const day2 = new Date(2026, 0, 2, 10).getTime();
    const daily = buildDailyWords([
      { nodeId: 'c1', createdAt: day1, length: 100 },
      { nodeId: 'c2', createdAt: day1, length: 50 },
      { nodeId: 'c1', createdAt: day2, length: 180 },
      { nodeId: 'c1', createdAt: day2, length: 150 },
    ]);
    expect(daily).toEqual([
      { date: '2026-01-01', words: 150 },
      { date: '2026-01-02', words: 80 },
    ]);
  });

  it('生成连续天数序列（含空日）', () => {
    const now = new Date(2026, 0, 10, 12);
    const days = recentDays([{ date: '2026-01-10', words: 500 }], 3, now);
    expect(days.map((entry) => entry.date)).toEqual(['2026-01-08', '2026-01-09', '2026-01-10']);
    expect(days[2]?.words).toBe(500);
    expect(toDateKey(now.getTime())).toBe('2026-01-10');
  });
});
