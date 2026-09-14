/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 同步恢复记录（docs/design/36 §4）：每次导入/下载/上传/导出留下一行可查记录
 * （结果、计数、失败原因），并单独登记"退出导出失败的书"，供下次启动提醒与重试。
 * 只落 localStorage 偏好区，不写业务数据；记录上限滚动淘汰。
 */
import { uuidv7 } from '@core/entities';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';

import { localStore } from './localStore';

export type SyncRecoveryKind = 'import' | 'download' | 'upload' | 'export' | 'exit-export';
export type SyncRecoveryOutcome = 'ok' | 'failed' | 'pending';

export interface SyncRecoveryRecord {
  id: string;
  /** 记录时间（毫秒时间戳）。 */
  at: number;
  kind: SyncRecoveryKind;
  outcome: SyncRecoveryOutcome;
  bookId?: string;
  applied?: number;
  skipped?: number;
  manual?: number;
  conflicts?: number;
  /** 失败原因或待处理说明；成功时省略。 */
  message?: string;
}

/** 记录滚动上限：只保留最近 N 条。 */
export const MAX_SYNC_RECORDS = 50;

function isRecord(value: unknown): value is SyncRecoveryRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.at === 'number' && typeof v.kind === 'string' && typeof v.outcome === 'string';
}

function readRecords(): SyncRecoveryRecord[] {
  const raw = localStore.getItem(STORAGE_KEYS.syncRecovery);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function writeRecords(records: SyncRecoveryRecord[]): void {
  localStore.setItem(STORAGE_KEYS.syncRecovery, JSON.stringify(records.slice(0, MAX_SYNC_RECORDS)));
}

/** 按时间倒序列出全部恢复记录（最近一条在前）。 */
export function listSyncRecoveryRecords(): SyncRecoveryRecord[] {
  return readRecords();
}

export interface SyncRecoveryInput {
  kind: SyncRecoveryKind;
  outcome: SyncRecoveryOutcome;
  bookId?: string;
  applied?: number;
  skipped?: number;
  manual?: number;
  conflicts?: number;
  message?: string;
}

/** 追加一条恢复记录（新记录在前，超出上限滚动淘汰）。 */
export function appendSyncRecoveryRecord(input: SyncRecoveryInput): SyncRecoveryRecord {
  const record: SyncRecoveryRecord = { id: uuidv7(), at: Date.now(), ...input };
  writeRecords([record, ...readRecords()]);
  return record;
}

export function clearSyncRecoveryRecords(): void {
  localStore.removeItem(STORAGE_KEYS.syncRecovery);
}

export interface PendingExitExport {
  bookId: string;
  at: number;
  message: string;
}

type PendingMap = Record<string, { at: number; message: string }>;

function readPending(): PendingMap {
  const raw = localStore.getItem(STORAGE_KEYS.syncPendingExports);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: PendingMap = {};
    for (const [bookId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'object' && value !== null && typeof (value as { at?: unknown }).at === 'number') {
        const entry = value as { at: number; message?: unknown };
        out[bookId] = { at: entry.at, message: typeof entry.message === 'string' ? entry.message : '' };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writePending(pending: PendingMap): void {
  localStore.setItem(STORAGE_KEYS.syncPendingExports, JSON.stringify(pending));
}

/** 列出上次退出导出失败、等待重试的书。 */
export function listPendingExitExports(): PendingExitExport[] {
  const pending = readPending();
  return Object.entries(pending)
    .map(([bookId, value]) => ({ bookId, at: value.at, message: value.message }))
    .sort((a, b) => b.at - a.at);
}

/** 登记一本书退出导出失败（按书去重，保留最新失败原因与时间）。 */
export function markExitExportFailed(bookId: string, message: string): void {
  const pending = readPending();
  pending[bookId] = { at: Date.now(), message };
  writePending(pending);
}

/** 清除一本书的退出导出失败登记（重试成功后调用）。 */
export function clearExitExportFailure(bookId: string): void {
  const pending = readPending();
  if (!(bookId in pending)) return;
  delete pending[bookId];
  writePending(pending);
}

export function clearPendingExitExports(): void {
  localStore.removeItem(STORAGE_KEYS.syncPendingExports);
}
