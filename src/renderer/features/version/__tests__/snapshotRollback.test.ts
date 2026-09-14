/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Chapter, ChapterSnapshot } from '@shared/types';
import { describe, expect, it } from 'vitest';

import { applyContentWithPreSnapshot, diffSnapshotSegments, hasSnapshotChanges, rollbackSegments, rollbackWhole } from '../snapshotRollback';

function chapter(content: string): Chapter {
  return { id: 'c1', title: '章', summary: '', content, order: 0 };
}

function snapshot(content: string): ChapterSnapshot {
  return { id: 's1', content, timestamp: 1, charCount: content.length, source: 'manual' };
}

describe('快照逐段比对', () => {
  it('区分未变、替换、删除、新增', () => {
    const changed = diffSnapshotSegments('A\nB\nC', 'A\nX\nC');
    expect(changed.map((s) => s.kind)).toEqual(['same', 'changed', 'same']);
    expect(changed[1]?.baseline).toBe('B');
    expect(changed[1]?.current).toBe('X');

    expect(diffSnapshotSegments('A\nB\nC', 'A\nC')[1]?.kind).toBe('removed');
    expect(diffSnapshotSegments('A\nC', 'A\nB\nC')[1]?.kind).toBe('added');
  });

  it('内容一致时无变更段', () => {
    expect(hasSnapshotChanges(chapter('A\nB'), snapshot('A\nB'))).toBe(false);
    expect(hasSnapshotChanges(chapter('A\nB'), snapshot('A\nX'))).toBe(true);
  });
});

describe('快照回滚', () => {
  it('整体回滚前自动再快照，可再撤销', () => {
    const current = chapter('A\nX\nC');
    const result = rollbackWhole(current, snapshot('A\nB\nC'), 100);
    expect(result.content).toBe('A\nB\nC');
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots?.[0]?.source).toBe('before-rollback');
    expect(result.snapshots?.[0]?.content).toBe('A\nX\nC');

    // 回滚可再撤销：再用 before-rollback 快照还原
    const undone = rollbackWhole(result, result.snapshots?.[0] as ChapterSnapshot, 200);
    expect(undone.content).toBe('A\nX\nC');
  });

  it('逐段回滚只替换选中段', () => {
    const current = chapter('A\nX\nC');
    const segments = diffSnapshotSegments('A\nB\nC', 'A\nX\nC');
    const changed = segments.find((s) => s.kind === 'changed');
    const result = rollbackSegments(current, snapshot('A\nB\nC'), changed ? [changed.id] : [], 100);
    expect(result.content).toBe('A\nB\nC');
    expect(result.snapshots?.[0]?.content).toBe('A\nX\nC');

    const none = rollbackSegments(current, snapshot('A\nB\nC'), [], 100);
    expect(none.content).toBe('A\nX\nC');
    expect(none.snapshots).toHaveLength(1);
  });

  it('应用任意内容前自动再快照（修订应用 / AI 重放共用）', () => {
    const result = applyContentWithPreSnapshot(chapter('当前正文'), '历史内容', 100);
    expect(result.content).toBe('历史内容');
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots?.[0]?.source).toBe('before-rollback');
    expect(result.snapshots?.[0]?.content).toBe('当前正文');
  });

  it('无 onUpdateChapter 的调用方仍可回滚（纯函数保留快照）', () => {
    const first = applyContentWithPreSnapshot(chapter('原文'), '改后', 1);
    const second = applyContentWithPreSnapshot(first, '再改', 2);
    expect(second.snapshots?.map((s) => s.content)).toEqual(['原文', '改后']);
  });
});
