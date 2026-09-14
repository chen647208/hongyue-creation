/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * AI 试错快照：每次 AI 会话开始前落一份章节快照，会话内可回滚；
 * 与正式历史分离——只存内存，不写章节 snapshots，也不产生修订。
 */
import { uuidv7 } from '@core/entities';
import type { Chapter } from '@shared/types';

export interface AiTrialSnapshot {
  id: string;
  sessionId: string;
  bookId?: string;
  /** 会话内步号，从 0 起。 */
  step: number;
  label: string;
  at: number;
  chapters: Chapter[];
}

export interface BeginTrialInput {
  sessionId: string;
  bookId?: string;
  label: string;
  chapters: Chapter[];
  at?: number;
}

export class AiTrialSnapshotService {
  private bySession = new Map<string, AiTrialSnapshot[]>();

  /** 会话（事务）开始前登记快照；同会话按步号追加。 */
  begin(input: BeginTrialInput): AiTrialSnapshot {
    const list = this.bySession.get(input.sessionId) ?? [];
    const snapshot: AiTrialSnapshot = {
      id: `trial_${uuidv7()}`,
      sessionId: input.sessionId,
      bookId: input.bookId,
      step: list.length,
      label: input.label,
      at: input.at ?? Date.now(),
      chapters: input.chapters.map((chapter) => ({ ...chapter })),
    };
    this.bySession.set(input.sessionId, [...list, snapshot]);
    return snapshot;
  }

  /** 列出试错快照；不传会话 id 时返回全部。 */
  list(sessionId?: string): AiTrialSnapshot[] {
    if (sessionId) return [...(this.bySession.get(sessionId) ?? [])];
    return [...this.bySession.values()].flat();
  }

  getLatest(sessionId: string): AiTrialSnapshot | undefined {
    const list = this.bySession.get(sessionId);
    if (!list || list.length === 0) return undefined;
    return list[list.length - 1];
  }

  /** 某本书最近一次试错快照（不传书 id 时取全局最近）；会话列表按登记顺序，末条最新。 */
  latestForBook(bookId?: string): AiTrialSnapshot | undefined {
    const all = this.list().filter((snapshot) => (bookId ? snapshot.bookId === bookId : true));
    return all[all.length - 1];
  }

  /** 回滚到指定试错快照，返回应恢复的章节；快照本身保留，可再次回滚。 */
  rollback(id: string): Chapter[] | null {
    for (const list of this.bySession.values()) {
      const snapshot = list.find((entry) => entry.id === id);
      if (snapshot) return snapshot.chapters.map((chapter) => ({ ...chapter }));
    }
    return null;
  }

  clear(sessionId?: string): void {
    if (sessionId) this.bySession.delete(sessionId);
    else this.bySession.clear();
  }
}

/** 进程内单例：渲染端共享一份试错快照表。 */
export const aiTrialSnapshots = new AiTrialSnapshotService();
