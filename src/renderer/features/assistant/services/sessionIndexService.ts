/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 会话元数据：命名与归档标记。
 *
 * 事件流（jsonl）仍是会话的唯一真源；这里只存展示用的名称与归档开关，
 * 不复制消息、不落第二份事件。按书分桶存在渲染端偏好（localStore）。
 */
import { STORAGE_KEYS } from '@shared/constants/storageKeys';

import { localStore } from '@/shared/services/localStore';

export interface SessionMeta {
  name?: string;
  archived?: boolean;
  updatedAt: number;
}

export type SessionMetaMap = Record<string, SessionMeta>;
type BookMetaIndex = Record<string, SessionMetaMap>;

/** 解析持久化 JSON；损坏或非对象返回空索引。 */
export function parseMetaIndex(raw: string | null): BookMetaIndex {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as BookMetaIndex;
  } catch {
    return {};
  }
}

/** 在书桶内写入/合并一条会话元数据，返回新索引（不改原对象）。 */
export function upsertMeta(index: BookMetaIndex, bookId: string, sessionId: string, patch: Partial<SessionMeta>): BookMetaIndex {
  const book = { ...(index[bookId] ?? {}) };
  book[sessionId] = { ...(book[sessionId] ?? { updatedAt: 0 }), ...patch, updatedAt: Date.now() };
  return { ...index, [bookId]: book };
}

function readIndex(): BookMetaIndex {
  return parseMetaIndex(localStore.getItem(STORAGE_KEYS.aiSessionMeta));
}

function writeIndex(index: BookMetaIndex): void {
  localStore.setItem(STORAGE_KEYS.aiSessionMeta, JSON.stringify(index));
}

/** 某本书的会话元数据快照（无记录返回空对象）。 */
export function readSessionMeta(bookId: string): SessionMetaMap {
  return readIndex()[bookId] ?? {};
}

/** 重命名会话（空名清除自定义名称，回落到任务文本）。 */
export function renameSession(bookId: string, sessionId: string, name: string): void {
  const clean = name.trim();
  writeIndex(upsertMeta(readIndex(), bookId, sessionId, { name: clean || undefined }));
}

/** 归档或恢复会话（恢复即 archived=false）。 */
export function setSessionArchived(bookId: string, sessionId: string, archived: boolean): void {
  writeIndex(upsertMeta(readIndex(), bookId, sessionId, { archived }));
}
