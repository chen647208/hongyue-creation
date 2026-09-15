/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 会话归档读取：userData/ai-sessions/<bookId>/*.jsonl → 事件列表（事件浏览器消费）。 */
import { type AiEvent,type Citation,parseEventLine } from '@core/ai';

import type { ChatMessage } from '../types';
import { readSessionMeta,type SessionMetaMap } from './sessionIndexService';

export interface SessionArchiveEntry {
  sessionId: string;
  fileName: string;
  events: AiEvent[];
  startedAt?: number;
  task?: string;
  ok?: boolean;
  /** 用户自定义名称（元数据，缺席时界面回落 task）。 */
  name?: string;
  /** 归档标记（元数据）；归档会话默认不出现在列表。 */
  archived?: boolean;
}

/** 把命名/归档元数据合并进归档列表；不改动事件（事件仍是唯一真源）。 */
export function applySessionMeta(entries: SessionArchiveEntry[], meta: SessionMetaMap): SessionArchiveEntry[] {
  return entries.map((entry) => {
    const m = meta[entry.sessionId];
    if (!m) return entry;
    return { ...entry, name: m.name, archived: m.archived };
  });
}

/** 关键词检索：命中自定义名称或任务文本（大小写不敏感）。 */
export function matchesSessionQuery(entry: SessionArchiveEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = (entry.name ?? entry.task ?? '').toLowerCase();
  return name.includes(q) || entry.sessionId.toLowerCase().includes(q);
}

/** 列表过滤：默认隐藏已归档；传 includeArchived 时一并展示。 */
export function filterSessionEntries(
  entries: SessionArchiveEntry[],
  query: string,
  includeArchived: boolean,
): SessionArchiveEntry[] {
  return entries.filter((entry) => (includeArchived || !entry.archived) && matchesSessionQuery(entry, query));
}

function electron(): NonNullable<Window['electronAPI']> {
  if (!window.electronAPI) {
    throw new Error('electronAPI 不可用（预览环境无文件系统）');
  }
  return window.electronAPI;
}

/** 列出某本书的全部会话归档，按开始时间倒序。 */
export async function listSessionArchives(bookId: string): Promise<SessionArchiveEntry[]> {
  const base = await electron().getAppDataPath();
  const dir = `${base}/ai-sessions/${bookId}`;
  const dirEntries = await electron().listDirectory(dir);
  const fileNames = dirEntries.filter((e) => e.type === 'file' && e.name.endsWith('.jsonl')).map((e) => e.name);
  const entries: SessionArchiveEntry[] = [];

  for (const fileName of fileNames) {
    try {
      const content = await electron().readFile(`${dir}/${fileName}`);
      const events = content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => parseEventLine(line))
        .filter((e): e is AiEvent => e !== null);
      const start = events.find((e) => e.t === 'session.start');
      const end = events.at(-1);
      entries.push({
        sessionId: fileName.replace(/\.jsonl$/, ''),
        fileName,
        events,
        startedAt: start?.at,
        task: start?.t === 'session.start' ? start.task : undefined,
        ok: end?.t === 'session.end' ? end.ok : undefined,
      });
    } catch {
      // 单文件读取失败跳过（损坏归档不阻断列表）
    }
  }

  const withMeta = applySessionMeta(entries, readSessionMeta(bookId));
  return withMeta.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
}

/** 归档会话中的一条对话消息（事件流是唯一真源）。 */
export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  at?: number;
}

/**
 * 从事件流重建对话消息：优先取 `message` 事件（用户/助手各一条）；
 * 旧归档无 `message` 事件时回落到 `session.start.task` 作为首条用户消息。
 */
export function extractSessionMessages(events: AiEvent[]): SessionMessage[] {
  const messages: SessionMessage[] = [];
  for (const event of events) {
    if (event.t === 'message' && event.content.trim()) {
      messages.push({ role: event.role, content: event.content, at: event.at });
    }
  }
  if (messages.length > 0) return messages;
  const start = events.find((e) => e.t === 'session.start');
  if (start?.t === 'session.start' && start.task.trim()) {
    return [{ role: 'user', content: start.task, at: start.at }];
  }
  return [];
}

/** 汇总归档会话中的检索引用（按 id 去重），附到最后一条助手消息。 */
function collectArchiveCitations(events: AiEvent[]): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const event of events) {
    if (event.t !== 'tool.result' || !event.citations) continue;
    for (const citation of event.citations) {
      if (seen.has(citation.id)) continue;
      seen.add(citation.id);
      citations.push(citation);
    }
  }
  return citations;
}

/** 把归档事件流转成可直接放进聊天区的消息（恢复为实时会话用）。 */
export function toChatMessages(events: AiEvent[]): ChatMessage[] {
  const sessionMessages = extractSessionMessages(events);
  const citations = collectArchiveCitations(events);
  const lastAssistantIndex = sessionMessages.map((m) => m.role).lastIndexOf('assistant');
  return sessionMessages.map((message, index) => ({
    id: `restored-${index}-${message.at ?? 0}`,
    role: message.role,
    content: message.content,
    timestamp: message.at ?? Date.now(),
    citations: index === lastAssistantIndex && citations.length > 0 ? citations : undefined,
  }));
}

/** 单会话用量汇总（事件浏览器消费；缺字段事件按 0 计）。 */
export interface SessionUsageSummary {
  turns: number;
  llmCalls: number;
  prompt: number;
  completion: number;
  total: number;
  cacheRead: number;
  cacheWrite: number;
  toolCalls: number;
}

export function summarizeSessionUsage(events: AiEvent[]): SessionUsageSummary {
  const summary: SessionUsageSummary = {
    turns: 0,
    llmCalls: 0,
    prompt: 0,
    completion: 0,
    total: 0,
    cacheRead: 0,
    cacheWrite: 0,
    toolCalls: 0,
  };
  for (const e of events) {
    if (e.t === 'turn.end') summary.turns = Math.max(summary.turns, e.turns);
    else if (e.t === 'llm.done') {
      summary.llmCalls += 1;
      const tokens = e.tokens as
        | { prompt?: number; completion?: number; total?: number; cacheRead?: number; cacheWrite?: number }
        | undefined;
      summary.prompt += tokens?.prompt ?? 0;
      summary.completion += tokens?.completion ?? 0;
      summary.total += tokens?.total ?? (tokens?.prompt ?? 0) + (tokens?.completion ?? 0);
      summary.cacheRead += tokens?.cacheRead ?? 0;
      summary.cacheWrite += tokens?.cacheWrite ?? 0;
    } else if (e.t === 'tool.call') {
      summary.toolCalls += 1;
    }
  }
  return summary;
}
