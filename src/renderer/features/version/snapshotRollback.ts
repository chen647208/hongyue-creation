/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 章节快照比对与回滚：与某一快照逐段比对，可逐段或整体回滚；
 * 回滚前把当前正文再落一份 before-rollback 快照，使回滚可再撤销。
 */
import type { Chapter, ChapterSnapshot } from '@shared/types';

import { appendSnapshot, createSnapshot } from '@/shared/services/chapterSnapshotService';

export type SnapshotSegmentKind = 'same' | 'changed' | 'added' | 'removed';

/** 一个段落（按行归并）：baseline 为快照文本，current 为当前文本。 */
export interface SnapshotSegment {
  id: string;
  kind: SnapshotSegmentKind;
  baselineLines: string[];
  currentLines: string[];
  baseline: string;
  current: string;
}

interface LineOp {
  type: 'same' | 'add' | 'del';
  text: string;
}

/** 行级 LCS：与历史 diff 同口径，此处自持以避免跨 feature 依赖。 */
function lineOps(baseline: string, current: string): LineOp[] {
  const a = baseline.split('\n');
  const b = current.split('\n');
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  const at = (r: number, c: number): number => dp[r * w + c] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const out: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] ?? '' });
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      out.push({ type: 'del', text: a[i] ?? '' });
      i++;
    } else {
      out.push({ type: 'add', text: b[j] ?? '' });
      j++;
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] ?? '' });
  while (j < m) out.push({ type: 'add', text: b[j++] ?? '' });
  return out;
}

/** 快照与当前正文的逐段差异；同段合并连续增删为可处理的变更段。 */
export function diffSnapshotSegments(baseline: string, current: string): SnapshotSegment[] {
  const ops = lineOps(baseline, current);
  const segments: SnapshotSegment[] = [];
  const push = (kind: SnapshotSegmentKind, baselineLines: string[], currentLines: string[]): void => {
    segments.push({
      id: `seg_${segments.length}`,
      kind,
      baselineLines,
      currentLines,
      baseline: baselineLines.join('\n'),
      current: currentLines.join('\n'),
    });
  };
  let index = 0;
  while (index < ops.length) {
    const op = ops[index];
    if (!op) break;
    if (op.type === 'same') {
      push('same', [op.text], [op.text]);
      index++;
      continue;
    }
    const baselineLines: string[] = [];
    const currentLines: string[] = [];
    while (index < ops.length && ops[index]?.type !== 'same') {
      const run = ops[index];
      if (run?.type === 'del') baselineLines.push(run.text);
      else if (run?.type === 'add') currentLines.push(run.text);
      index++;
    }
    const kind: SnapshotSegmentKind = baselineLines.length > 0 && currentLines.length > 0
      ? 'changed'
      : baselineLines.length > 0
        ? 'removed'
        : 'added';
    push(kind, baselineLines, currentLines);
  }
  return segments;
}

/** 快照与当前是否存在差异。 */
export function hasSnapshotChanges(chapter: Chapter, snapshot: ChapterSnapshot): boolean {
  return diffSnapshotSegments(snapshot.content, chapter.content ?? '').some((segment) => segment.kind !== 'same');
}

function withRollbackSnapshot(chapter: Chapter, now: number): Chapter {
  return appendSnapshot(chapter, createSnapshot(chapter.content ?? '', 'before-rollback', now));
}

/** 整体回滚到快照：先给当前正文留 before-rollback 快照，再替换为快照内容。 */
export function rollbackWhole(chapter: Chapter, snapshot: ChapterSnapshot, now: number = Date.now()): Chapter {
  return { ...withRollbackSnapshot(chapter, now), content: snapshot.content };
}

/** 逐段回滚：只把选中段替换为快照文本，其余保留当前文本。 */
export function rollbackSegments(
  chapter: Chapter,
  snapshot: ChapterSnapshot,
  selectedSegmentIds: Iterable<string>,
  now: number = Date.now(),
): Chapter {
  const selected = new Set(selectedSegmentIds);
  const segments = diffSnapshotSegments(snapshot.content, chapter.content ?? '');
  const lines: string[] = [];
  for (const segment of segments) {
    const useBaseline = segment.kind !== 'same' && selected.has(segment.id);
    lines.push(...(useBaseline ? segment.baselineLines : segment.currentLines));
  }
  return { ...withRollbackSnapshot(chapter, now), content: lines.join('\n') };
}
