/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 退出导出（docs/design/36 §5）：应用退出时按配置把每本书的同步包上传到已配置的
 * 传输后端（本地目录 / WebDAV / S3）。失败按书登记到本地，下次启动提醒并可重试。
 * 复用 buildSyncBundle + 传输层，不新造导出格式。依赖以参数注入，便于单测。
 */
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import type { SyncTransportConfig } from '@shared/types';

import { localStore } from './localStore';
import {
  appendSyncRecoveryRecord,
  clearExitExportFailure,
  listPendingExitExports,
  markExitExportFailed,
  type PendingExitExport,
} from './syncRecoveryService';
import { uploadSyncBundle } from './syncService';
import { isTransportReady, loadSyncTransportConfig } from './syncTransportService';

export interface ExitExportConfig {
  enabled: boolean;
}

export function defaultExitExportConfig(): ExitExportConfig {
  return { enabled: false };
}

export function loadExitExportConfig(): ExitExportConfig {
  const raw = localStore.getItem(STORAGE_KEYS.syncExitExport);
  if (!raw) return defaultExitExportConfig();
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && (parsed as { enabled?: unknown }).enabled === true
      ? { enabled: true }
      : defaultExitExportConfig();
  } catch {
    return defaultExitExportConfig();
  }
}

export function saveExitExportConfig(config: ExitExportConfig): void {
  localStore.setItem(STORAGE_KEYS.syncExitExport, JSON.stringify(config));
}

export interface ExitExportProject {
  id: string;
  title: string;
}

export interface ExitExportFailure {
  bookId: string;
  title: string;
  message: string;
}

export interface ExitExportSummary {
  total: number;
  succeeded: number;
  failed: ExitExportFailure[];
}

/** 退出导出/重试的可注入依赖（生产用 createExitExportDeps 组装）。 */
export interface ExitExportDeps {
  listProjects: () => ExitExportProject[];
  loadConfig: () => ExitExportConfig;
  loadTransport: () => SyncTransportConfig | null;
  upload: (bookId: string, config: SyncTransportConfig) => Promise<{ key: string; changeCount: number }>;
  record: typeof appendSyncRecoveryRecord;
  markFailed: (bookId: string, message: string) => void;
  markSucceeded: (bookId: string) => void;
  listPending: () => PendingExitExport[];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 执行退出导出：逐书上传；逐书登记成功/失败。未启用或未配置传输时，启用则逐书记失败，
 * 未启用则直接返回空摘要（不产生噪音记录）。
 */
export async function runExitExport(deps: ExitExportDeps): Promise<ExitExportSummary> {
  const summary: ExitExportSummary = { total: 0, succeeded: 0, failed: [] };
  if (!deps.loadConfig().enabled) return summary;

  const projects = deps.listProjects();
  summary.total = projects.length;
  const transport = deps.loadTransport();

  if (!transport || !isTransportReady(transport)) {
    const message = '未配置可用的同步传输后端，退出导出已跳过';
    for (const project of projects) {
      deps.markFailed(project.id, message);
      deps.record({ kind: 'exit-export', outcome: 'failed', bookId: project.id, message });
      summary.failed.push({ bookId: project.id, title: project.title, message });
    }
    return summary;
  }

  for (const project of projects) {
    try {
      const result = await deps.upload(project.id, transport);
      deps.markSucceeded(project.id);
      deps.record({ kind: 'exit-export', outcome: 'ok', bookId: project.id, applied: result.changeCount });
      summary.succeeded += 1;
    } catch (error) {
      const message = messageOf(error);
      deps.markFailed(project.id, message);
      deps.record({ kind: 'exit-export', outcome: 'failed', bookId: project.id, message });
      summary.failed.push({ bookId: project.id, title: project.title, message });
    }
  }
  return summary;
}

/** 重试上次失败/未完成的退出导出（外部触发：启动提醒确认后调用）。 */
export async function retryPendingExitExports(deps: ExitExportDeps): Promise<ExitExportSummary> {
  const pending = deps.listPending();
  const summary: ExitExportSummary = { total: pending.length, succeeded: 0, failed: [] };
  if (pending.length === 0) return summary;

  const titles = new Map(deps.listProjects().map((p) => [p.id, p.title]));
  const transport = deps.loadTransport();

  if (!transport || !isTransportReady(transport)) {
    const message = '未配置可用的同步传输后端，无法重试退出导出';
    for (const item of pending) {
      deps.markFailed(item.bookId, message);
      summary.failed.push({ bookId: item.bookId, title: titles.get(item.bookId) ?? item.bookId, message });
    }
    return summary;
  }

  for (const item of pending) {
    try {
      const result = await deps.upload(item.bookId, transport);
      deps.markSucceeded(item.bookId);
      deps.record({ kind: 'exit-export', outcome: 'ok', bookId: item.bookId, applied: result.changeCount, message: '退出导出重试成功' });
      summary.succeeded += 1;
    } catch (error) {
      const message = messageOf(error);
      deps.markFailed(item.bookId, message);
      deps.record({ kind: 'exit-export', outcome: 'failed', bookId: item.bookId, message });
      summary.failed.push({ bookId: item.bookId, title: titles.get(item.bookId) ?? item.bookId, message });
    }
  }
  return summary;
}

/** 组装生产依赖：传输/记录走既有服务，书单由调用方（store 持有者）提供。 */
export function createExitExportDeps(listProjects: () => ExitExportProject[]): ExitExportDeps {
  return {
    listProjects,
    loadConfig: loadExitExportConfig,
    loadTransport: loadSyncTransportConfig,
    upload: (bookId, config) => uploadSyncBundle(bookId, config, { maxAttempts: 1 }),
    record: appendSyncRecoveryRecord,
    markFailed: markExitExportFailed,
    markSucceeded: clearExitExportFailure,
    listPending: listPendingExitExports,
  };
}
