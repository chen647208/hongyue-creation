/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { AiEvent } from '@core/ai';
import { describe, expect,it } from 'vitest';

import {
  applySessionMeta,
  filterSessionEntries,
  matchesSessionQuery,
  type SessionArchiveEntry,
  summarizeSessionUsage,
} from '../sessionArchive';
import { parseMetaIndex, upsertMeta } from '../sessionIndexService';

const at = 1;

function entry(sessionId: string, task: string): SessionArchiveEntry {
  return { sessionId, fileName: `${sessionId}.jsonl`, task, events: [] };
}

describe('会话归档元数据与过滤', () => {
  it('applySessionMeta 合并名称与归档标记，不改事件', () => {
    const entries = [entry('s1', '旧任务'), entry('s2', '另一任务')];
    const meta = { s1: { name: '第一章草稿', archived: true, updatedAt: 9 } };
    const merged = applySessionMeta(entries, meta);
    expect(merged[0]).toMatchObject({ sessionId: 's1', name: '第一章草稿', archived: true });
    expect(merged[1]!.name).toBeUndefined();
    expect(merged[1]!.events).toBe(entries[1]!.events);
  });

  it('搜索命中名称或任务，默认隐藏已归档', () => {
    const entries = [
      { ...entry('s1', '普通任务'), archived: true },
      { ...entry('s2', '角色设定') },
    ];
    expect(filterSessionEntries(entries, '', false).map((e) => e.sessionId)).toEqual(['s2']);
    expect(filterSessionEntries(entries, '', true).map((e) => e.sessionId)).toEqual(['s1', 's2']);
    expect(filterSessionEntries(entries, '角色', false).map((e) => e.sessionId)).toEqual(['s2']);
    expect(matchesSessionQuery(entries[1]!, 'S2')).toBe(true);
    expect(matchesSessionQuery(entries[1]!, '不存在')).toBe(false);
  });
});

describe('parseMetaIndex / upsertMeta', () => {
  it('损坏输入回退空索引，upsert 按书分桶合并', () => {
    expect(parseMetaIndex(null)).toEqual({});
    expect(parseMetaIndex('{oops')).toEqual({});
    const idx = upsertMeta(upsertMeta({}, 'book1', 's1', { name: '甲' }), 'book1', 's1', { archived: true });
    expect(idx.book1!.s1).toMatchObject({ name: '甲', archived: true });
    const idx2 = upsertMeta(idx, 'book2', 's2', { name: '乙' });
    expect(idx2.book2!.s2!.name).toBe('乙');
    expect(idx2.book1!.s1!.name).toBe('甲');
  });
});

describe('summarizeSessionUsage', () => {
  it('累计轮次/调用/用量与缓存命中', () => {
    const cachedTokens = { prompt: 1300, completion: 50, total: 1350, cacheRead: 1100, cacheWrite: 100 };
    const events: AiEvent[] = [
      { t: 'session.start', sessionId: 's', task: '写', sections: [], at },
      { t: 'turn.start', turn: 1, at },
      { t: 'llm.done', turn: 1, tokens: { prompt: 1200, completion: 30, total: 1230 }, at },
      { t: 'tool.call', turn: 1, callId: 'c1', toolId: 'core.chapter.read', args: {}, at },
      { t: 'tool.result', turn: 1, callId: 'c1', ok: true, at },
      { t: 'turn.end', turn: 1, turns: 1, at },
      { t: 'turn.start', turn: 2, at },
      { t: 'llm.done', turn: 2, tokens: cachedTokens, at } as AiEvent,
      { t: 'turn.end', turn: 2, turns: 2, at },
      { t: 'session.end', ok: true, at },
    ];
    const s = summarizeSessionUsage(events);
    expect(s).toEqual({
      turns: 2,
      llmCalls: 2,
      prompt: 2500,
      completion: 80,
      total: 2580,
      cacheRead: 1100,
      cacheWrite: 100,
      toolCalls: 1,
    });
  });

  it('缺 tokens 字段的事件按 0 计', () => {
    const events: AiEvent[] = [
      { t: 'llm.done', turn: 1, at },
      { t: 'turn.end', turn: 1, turns: 1, at },
    ];
    expect(summarizeSessionUsage(events)).toEqual({
      turns: 1,
      llmCalls: 1,
      prompt: 0,
      completion: 0,
      total: 0,
      cacheRead: 0,
      cacheWrite: 0,
      toolCalls: 0,
    });
  });

  it('空事件返回零汇总', () => {
    expect(summarizeSessionUsage([]).total).toBe(0);
  });
});
