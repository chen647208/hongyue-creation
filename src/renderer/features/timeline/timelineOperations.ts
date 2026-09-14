/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 时间线非破坏操作：插入、覆盖、滑动只产出新章节数组，配快照式撤销栈。 */
import { uuidv7 } from '@core/entities';
import type { Chapter } from '@shared/types';

import { MIN_CLIP_DURATION, reorderChapters, type TimelineTrack } from './timelineModel';

export type TimelineOperationKind = 'insert' | 'remove' | 'overwrite' | 'slide' | 'move';
/** 插入语义：涟漪把后续片段整体后移，覆盖替换目标位置的片段。 */
export type InsertMode = 'ripple' | 'overwrite';

/** 一次可撤销编辑：before/after 为章节数组全量快照，逆操作即取回 before。 */
export interface TimelineEdit {
  id: string;
  kind: TimelineOperationKind;
  /** 面向用户的动作名（审计与撤销提示）。 */
  label: string;
  /** 'user' 或 'ai:<tool>'。 */
  author: string;
  cause?: string;
  at: number;
  before: Chapter[];
  after: Chapter[];
}

export type TimelineEditMeta = Omit<TimelineEdit, 'id' | 'at' | 'before' | 'after'>;

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length, Math.trunc(index)));
}

function withOrder(chapters: Chapter[]): Chapter[] {
  return chapters.map((chapter, order) => ({ ...chapter, order }));
}

/** 插入片段：涟漪插入后整体后移，覆盖替换同位置片段。 */
export function insertClip(
  chapters: Chapter[],
  input: { index: number; chapter: Chapter; mode: InsertMode },
): Chapter[] {
  const index = clampIndex(input.index, chapters.length);
  if (input.mode === 'overwrite' && index < chapters.length) {
    return withOrder([...chapters.slice(0, index), input.chapter, ...chapters.slice(index + 1)]);
  }
  return withOrder([...chapters.slice(0, index), input.chapter, ...chapters.slice(index)]);
}

/** 覆盖正文：保留片段位置与其他字段，只替换内容。 */
export function overwriteClip(chapters: Chapter[], chapterId: string, content: string): Chapter[] {
  return chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, content } : chapter));
}

/** 滑动时长：只改目标片段长度，后续片段位置不变。 */
export function slideClip(chapters: Chapter[], chapterId: string, duration: number): Chapter[] {
  const next = Math.max(MIN_CLIP_DURATION, duration);
  return chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, duration: next } : chapter));
}

/** 删除片段并重排全局 order（作为插入的逆操作）。 */
export function removeClip(chapters: Chapter[], chapterId: string): Chapter[] {
  return withOrder(chapters.filter((chapter) => chapter.id !== chapterId));
}

/** 换轨/换位：复用 reorderChapters 的轨道重排语义。 */
export function moveClip(
  chapters: Chapter[],
  tracks: TimelineTrack[],
  chapterId: string,
  targetTrackId: string,
  targetIndex: number,
): Chapter[] {
  return reorderChapters(chapters, tracks, chapterId, targetTrackId, targetIndex);
}

/**
 * 时间线撤销栈：每次编辑记录 before/after 全量快照，撤销即回到 before，
 * 重做即回到 after；新编辑截断已撤销的重做分支。
 */
export class TimelineHistory {
  private edits: TimelineEdit[] = [];
  private cursor = -1;
  private baseline: Chapter[];

  constructor(initial: Chapter[]) {
    this.baseline = initial;
  }

  reset(initial: Chapter[]): void {
    this.edits = [];
    this.cursor = -1;
    this.baseline = initial;
  }

  get canUndo(): boolean {
    return this.cursor >= 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.edits.length - 1;
  }

  get current(): Chapter[] {
    const edit = this.edits[this.cursor];
    return edit ? edit.after : this.baseline;
  }

  /** 可回溯的编辑列表（时间正序）。 */
  list(): ReadonlyArray<TimelineEdit> {
    return this.edits;
  }

  record(meta: TimelineEditMeta, after: Chapter[]): TimelineEdit {
    const before = this.current;
    if (this.cursor < this.edits.length - 1) {
      this.edits = this.edits.slice(0, this.cursor + 1);
    }
    const edit: TimelineEdit = { id: `edit_${Date.now()}_${uuidv7()}`, at: Date.now(), before, after, ...meta };
    this.edits.push(edit);
    this.cursor = this.edits.length - 1;
    return edit;
  }

  undo(): Chapter[] | null {
    const edit = this.edits[this.cursor];
    if (!edit) return null;
    this.cursor -= 1;
    return edit.before;
  }

  redo(): Chapter[] | null {
    const edit = this.edits[this.cursor + 1];
    if (!edit) return null;
    this.cursor += 1;
    return edit.after;
  }
}
