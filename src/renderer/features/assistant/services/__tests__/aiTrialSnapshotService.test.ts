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

import { AiTrialSnapshotService } from '../aiTrialSnapshotService';

function chapter(id: string, content: string, snapshots: Chapter['snapshots'] = []): Chapter {
  return { id, title: id, summary: '', content, order: 0, snapshots };
}

describe('AI 试错快照', () => {
  let service: AiTrialSnapshotService;

  beforeEach(() => {
    service = new AiTrialSnapshotService();
  });

  it('会话前登记，回滚恢复到该步章节', () => {
    const before = [chapter('c1', '原文')];
    service.begin({ sessionId: 's1', bookId: 'b1', label: '改写正文', chapters: before });
    const corrupted = [chapter('c1', '被改坏的正文')];
    const restored = service.rollback(service.getLatest('s1')?.id ?? '');
    expect(restored).toEqual(before);
    expect(restored).not.toEqual(corrupted);
  });

  it('同会话多步按序记录，可回滚任意一步', () => {
    service.begin({ sessionId: 's1', label: 'step0', chapters: [chapter('c1', 'v0')] });
    service.begin({ sessionId: 's1', label: 'step1', chapters: [chapter('c1', 'v1')] });
    const list = service.list('s1');
    expect(list.map((entry) => entry.step)).toEqual([0, 1]);
    expect(service.rollback(list[0]?.id ?? '')?.[0]?.content).toBe('v0');
    expect(service.rollback(list[1]?.id ?? '')?.[0]?.content).toBe('v1');
  });

  it('与正式历史隔离：不写章节 snapshots', () => {
    const formal = [chapter('c1', '原文', [{ id: 'snap1', content: '更早', timestamp: 1, charCount: 2, source: 'manual' }])];
    service.begin({ sessionId: 's1', label: 'task', chapters: formal });
    expect(formal[0]?.snapshots).toHaveLength(1);
    expect(service.list('s1')[0]?.chapters[0]?.snapshots).toHaveLength(1);
    expect(service.list('s1')).toHaveLength(1);
  });

  it('clear 按会话或整体清空', () => {
    service.begin({ sessionId: 's1', label: 'a', chapters: [] });
    service.begin({ sessionId: 's2', label: 'b', chapters: [] });
    expect(service.list()).toHaveLength(2);
    service.clear('s1');
    expect(service.list()).toHaveLength(1);
    service.clear();
    expect(service.list()).toHaveLength(0);
  });
});
