/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 会话事件流（docs/design/05 §4，codex rollout 模式）。
 *
 * 每轮 AI 任务全程事件化并落盘为 jsonl（一行一事件，append-only）：
 * 可回放、可恢复（崩溃续跑）、可审计。「AI 历史」UI 升级为事件浏览器。
 * 事件为纯数据；落盘经 SessionSink 抽象（渲染端用 electronAPI 文件写）。
 */
import type { Citation } from './grounding.js';

export type AiEvent =
  | { t: 'session.start'; sessionId: string; bookId?: string; task: string; skill?: string; sections: string[]; at: number }
  | { t: 'message'; role: 'user' | 'assistant'; content: string; at: number }
  | { t: 'context.injection'; enabled: boolean; entries: number; dropped: number; totalChars: number; budgetChars: number; at: number }
  | { t: 'turn.start'; turn: number; at: number }
  | { t: 'llm.request'; turn: number; model: string; promptChars: number; at: number }
  | { t: 'llm.delta'; turn: number; accumulatedChars: number; at: number }
  | { t: 'llm.done'; turn: number; tokens?: { prompt: number; completion: number; total: number }; at: number }
  | { t: 'llm.error'; turn: number; error: string; at: number }
  | { t: 'tool.call'; turn: number; callId: string; toolId: string; args: unknown; at: number }
  | { t: 'tool.approval'; turn: number; callId: string; verdict: 'approved' | 'rejected' | 'timeout' | 'skipped'; by: string; at: number }
  | { t: 'write.direct'; callId: string; toolId: string; at: number }
  | { t: 'tool.result'; turn: number; callId: string; ok: boolean; error?: string; citations?: Citation[]; at: number }
  | { t: 'turn.end'; turn: number; turns: number; at: number }
  | { t: 'session.end'; ok: boolean; error?: string; at: number }
  | { t: 'mcp.sync'; ok: boolean; error?: string; at: number };

/** 事件持久化接口：渲染端实现为 electronAPI 文件追加写。 */
export interface SessionSink {
  append(sessionId: string, line: string): Promise<void>;
}

export function serializeEvent(event: AiEvent): string {
  return JSON.stringify(event);
}

export function parseEventLine(line: string): AiEvent | null {
  try {
    const parsed = JSON.parse(line) as AiEvent;
    return typeof parsed === 'object' && parsed !== null && 't' in parsed ? parsed : null;
  } catch {
    return null;
  }
}

export interface SessionOptions {
  sessionId: string;
  bookId?: string;
  task: string;
  sections: string[];
  skill?: string;
  sink?: SessionSink;
}

/** 一次 AI 会话的事件记录器：内存持有全部事件，逐行同步落盘。 */
export class AiSession {
  readonly id: string;
  readonly events: AiEvent[] = [];
  private readonly sink?: SessionSink;
  private closed = false;

  constructor(private readonly options: SessionOptions) {
    this.id = options.sessionId;
    this.sink = options.sink;
  }

  async start(): Promise<void> {
    await this.emit({
      t: 'session.start',
      sessionId: this.options.sessionId,
      bookId: this.options.bookId,
      task: this.options.task,
      skill: this.options.skill,
      sections: this.options.sections,
      at: Date.now(),
    });
  }

  async emit(event: AiEvent): Promise<void> {
    if (this.closed) return;
    this.events.push(event);
    if (this.sink) {
      await this.sink.append(this.id, serializeEvent(event));
    }
  }

  /** 正常收尾；之后忽略新事件（崩溃场景不调用它，jsonl 天然保留已落盘前缀）。 */
  async end(ok: boolean, error?: string): Promise<void> {
    await this.emit({ t: 'session.end', ok, error, at: Date.now() });
    this.closed = true;
  }
}
