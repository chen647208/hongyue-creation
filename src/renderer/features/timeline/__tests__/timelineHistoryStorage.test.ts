/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Chapter } from '@shared/types';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearTimelineHistory,
  type HistoryStorage,
  loadTimelineHistory,
  MAX_PERSISTED_HISTORY_CHARS,
  saveTimelineHistory,
  timelineHistoryKey,
} from '../timelineHistoryStorage';
import { insertClip, TimelineHistory } from '../timelineOperations';

function chapter(id: string, order: number, over: Partial<Chapter> = {}): Chapter {
  return { id, title: id, summary: '', content: '', order, ...over };
}

class MemoryStorage implements HistoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe('时间线撤销栈持久化', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('保存后可载入，且停在其自身状态（撤销/重做可续）', () => {
    const base = [chapter('c1', 0)];
    const history = new TimelineHistory(base);
    const after = insertClip(base, { index: 1, chapter: chapter('cN', 0), mode: 'ripple' });
    history.record({ kind: 'insert', label: '插入', author: 'user' }, after);
    history.undo();

    expect(saveTimelineHistory('book1', history, storage)).toBe(true);
    const loaded = loadTimelineHistory('book1', base, storage);
    expect(loaded?.current).toEqual(base);
    expect(loaded?.canRedo).toBe(true);
    expect(loaded?.redo()).toEqual(after);
  });

  it('栈顶与当前章节不一致时载入返回 null（避免撤销跳到旧状态）', () => {
    const base = [chapter('c1', 0)];
    const history = new TimelineHistory(base);
    saveTimelineHistory('book1', history, storage);
    const movedOn = [chapter('c1', 0, { content: '外部改过' })];
    expect(loadTimelineHistory('book1', movedOn, storage)).toBeNull();
  });

  it('clear 删除所存栈', () => {
    const base = [chapter('c1', 0)];
    saveTimelineHistory('book1', new TimelineHistory(base), storage);
    expect(storage.getItem(timelineHistoryKey('book1'))).not.toBeNull();
    clearTimelineHistory('book1', storage);
    expect(storage.getItem(timelineHistoryKey('book1'))).toBeNull();
  });

  it('损坏数据不抛出，按无栈处理', () => {
    storage.setItem(timelineHistoryKey('book1'), '{not json');
    expect(loadTimelineHistory('book1', [chapter('c1', 0)], storage)).toBeNull();
  });

  it('超过体积上限时跳过落盘', () => {
    const base = [chapter('c1', 0, { content: 'x'.repeat(MAX_PERSISTED_HISTORY_CHARS) })];
    const history = new TimelineHistory(base);
    const after = [chapter('c1', 0, { content: 'y'.repeat(MAX_PERSISTED_HISTORY_CHARS) })];
    history.record({ kind: 'overwrite', label: '覆盖', author: 'user' }, after);
    expect(saveTimelineHistory('book1', history, storage)).toBe(false);
    expect(storage.getItem(timelineHistoryKey('book1'))).toBeNull();
  });
});
