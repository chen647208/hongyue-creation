/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 自动注入偏好（按书持久化）：整体开关与单条关闭按书 id 存 localStorage，
 * 重启保留；未登记时回落默认（开启、无关闭条目）。
 */
import { STORAGE_KEYS } from '@shared/constants/storageKeys';

import { localStore } from '@/shared/services/localStore';

export interface InjectionPreference {
  enabled: boolean;
  disabledIds: string[];
}

/** 无活动书时的占位键（新建书前也能记录偏好）。 */
const NO_BOOK_KEY = '__none__';

function keyOf(bookId: string | undefined): string {
  return bookId?.trim() || NO_BOOK_KEY;
}

function readMap(): Record<string, unknown> {
  const raw = localStore.getItem(STORAGE_KEYS.aiInjectionPrefs);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, unknown>): void {
  localStore.setItem(STORAGE_KEYS.aiInjectionPrefs, JSON.stringify(map));
}

export function defaultInjectionPreference(): InjectionPreference {
  return { enabled: true, disabledIds: [] };
}

/** 读取某书的注入偏好；缺失或损坏时回落默认。 */
export function loadInjectionPreference(bookId: string | undefined): InjectionPreference {
  const entry = readMap()[keyOf(bookId)];
  if (typeof entry !== 'object' || entry === null) return defaultInjectionPreference();
  const value = entry as { enabled?: unknown; disabledIds?: unknown };
  return {
    enabled: value.enabled !== false,
    disabledIds: Array.isArray(value.disabledIds)
      ? value.disabledIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

/** 写入某书的注入偏好（覆盖该书的登记）。 */
export function saveInjectionPreference(bookId: string | undefined, preference: InjectionPreference): void {
  const map = readMap();
  map[keyOf(bookId)] = {
    enabled: preference.enabled !== false,
    disabledIds: preference.disabledIds.filter((id): id is string => typeof id === 'string'),
  };
  writeMap(map);
}

export function clearInjectionPreferences(): void {
  localStore.removeItem(STORAGE_KEYS.aiInjectionPrefs);
}
