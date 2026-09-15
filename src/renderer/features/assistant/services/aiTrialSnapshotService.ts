/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * AI 试错快照：AI 会话开始前落一份基线快照，之后每次写类工具事务前再落一步，会话内可回滚到任意一步。
 *
 * 持久化在渲染层本地侧车（localStorage），重启后仍可回滚；与正式历史分离——不写章节 snapshots、不产生修订。
 * 存储面可注入，便于测试与替换后端。
 */
import { uuidv7 } from '@core/entities';
import { MAX_TRIAL_SESSIONS, MAX_TRIAL_STEPS_PER_SESSION } from '@shared/constants/aiTrial';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import type { Chapter } from '@shared/types';

import { localStore } from '@/shared/services/localStore';

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

/** 试错快照的持久化存储面；默认走 localStore，测试可注入替身。 */
export interface TrialSnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PersistedTrialSnapshots {
  version: 1;
  sessions: Array<{ sessionId: string; snapshots: AiTrialSnapshot[] }>;
}

function cloneChapter(chapter: Chapter): Chapter {
  return { ...chapter };
}

function cloneSnapshot(snapshot: AiTrialSnapshot): AiTrialSnapshot {
  return { ...snapshot, chapters: snapshot.chapters.map(cloneChapter) };
}

function isChapterList(value: unknown): value is Chapter[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null && typeof (item as Chapter).id === 'string');
}

function parseSnapshot(value: unknown): AiTrialSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.sessionId !== 'string' || !isChapterList(record.chapters)) return null;
  return {
    id: record.id,
    sessionId: record.sessionId,
    bookId: typeof record.bookId === 'string' ? record.bookId : undefined,
    step: typeof record.step === 'number' ? record.step : 0,
    label: typeof record.label === 'string' ? record.label : '',
    at: typeof record.at === 'number' ? record.at : 0,
    chapters: record.chapters.map(cloneChapter),
  };
}

function localTrialStorage(): TrialSnapshotStorage {
  // 走 localStore 唯一存储出口；localStore 在无 localStorage 环境下自行兜底。
  return {
    getItem: (key) => localStore.getItem(key),
    setItem: (key, value) => localStore.setItem(key, value),
    removeItem: (key) => localStore.removeItem(key),
  };
}

export class AiTrialSnapshotService {
  private bySession = new Map<string, AiTrialSnapshot[]>();
  private readonly storage: TrialSnapshotStorage;

  constructor(storage: TrialSnapshotStorage = localTrialStorage()) {
    this.storage = storage;
    this.load();
  }

  private load(): void {
    const raw = this.storage.getItem(STORAGE_KEYS.aiTrialSnapshots);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedTrialSnapshots>;
      if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) return;
      for (const entry of parsed.sessions) {
        if (!entry || typeof entry.sessionId !== 'string' || !Array.isArray(entry.snapshots)) continue;
        const snapshots = entry.snapshots.map(parseSnapshot).filter((item): item is AiTrialSnapshot => item !== null);
        if (snapshots.length > 0) this.bySession.set(entry.sessionId, snapshots);
      }
    } catch {
      // 损坏数据不阻断启动：按无快照处理
    }
  }

  private persist(): void {
    const sessions = [...this.bySession.entries()].map(([sessionId, snapshots]) => ({ sessionId, snapshots }));
    const payload: PersistedTrialSnapshots = { version: 1, sessions };
    this.storage.setItem(STORAGE_KEYS.aiTrialSnapshots, JSON.stringify(payload));
  }

  /** 会话（事务）开始前登记快照；同会话按步号追加，超出上限淘汰最旧会话/步。 */
  begin(input: BeginTrialInput): AiTrialSnapshot {
    const list = this.bySession.get(input.sessionId) ?? [];
    const snapshot: AiTrialSnapshot = {
      id: `trial_${uuidv7()}`,
      sessionId: input.sessionId,
      bookId: input.bookId,
      step: list.length,
      label: input.label,
      at: input.at ?? Date.now(),
      chapters: input.chapters.map(cloneChapter),
    };
    this.bySession.set(input.sessionId, this.trimSteps([...list, snapshot]));
    this.evictSessions();
    this.persist();
    return cloneSnapshot(snapshot);
  }

  /** 单会话快照步数超限时丢弃最旧一步并重排步号（回滚仍按 id）。 */
  private trimSteps(list: AiTrialSnapshot[]): AiTrialSnapshot[] {
    if (list.length <= MAX_TRIAL_STEPS_PER_SESSION) return list;
    const kept = list.slice(list.length - MAX_TRIAL_STEPS_PER_SESSION);
    return kept.map((snapshot, index) => (snapshot.step === index ? snapshot : { ...snapshot, step: index }));
  }

  /** 会话数超限时淘汰最旧登记的会话。 */
  private evictSessions(): void {
    while (this.bySession.size > MAX_TRIAL_SESSIONS) {
      const oldest = this.bySession.keys().next().value;
      if (oldest === undefined) return;
      this.bySession.delete(oldest);
    }
  }

  /** 列出试错快照；不传会话 id 时返回全部。 */
  list(sessionId?: string): AiTrialSnapshot[] {
    if (sessionId) return [...(this.bySession.get(sessionId) ?? [])].map(cloneSnapshot);
    return [...this.bySession.values()].flat().map(cloneSnapshot);
  }

  getLatest(sessionId: string): AiTrialSnapshot | undefined {
    const list = this.bySession.get(sessionId);
    if (!list || list.length === 0) return undefined;
    const latest = list[list.length - 1];
    return latest ? cloneSnapshot(latest) : undefined;
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
      if (snapshot) return snapshot.chapters.map(cloneChapter);
    }
    return null;
  }

  clear(sessionId?: string): void {
    if (sessionId) this.bySession.delete(sessionId);
    else this.bySession.clear();
    this.persist();
  }
}

/** 进程内单例：渲染端共享一份试错快照表，启动即从本地侧车恢复。 */
export const aiTrialSnapshots = new AiTrialSnapshotService();
