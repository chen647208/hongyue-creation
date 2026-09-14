/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 写作统计（纯函数）：字数、段落、句子、阅读时长、全书进度。
 */
import { DEFAULT_BUILD_PROFILE, runBuild } from '@core/build';
import { stripBlockAnchors } from '@core/dsl/anchor';

import { i18n } from '@/i18n';

import type { Chapter, Project } from '../../../../shared/types';
import type { BookStats,ChapterStats } from '../types';
import { projectToBuildEntities } from '../utils';

export type { BookStats,ChapterStats };

const READING_CHARS_PER_MINUTE = 400;

/** 字数口径：标记为素材的章节不参与字数与码字统计（未标记即计数）。 */
export function countableChapters(chapters: Chapter[]): Chapter[] {
  return chapters.filter((chapter) => !chapter.material);
}

export function computeChapterStats(content: string): ChapterStats {
  // 块锚是编辑器元数据，不计入正文字数/段落口径。
  const text = stripBlockAnchors(content ?? '');
  const charCount = text.replace(/\s+/g, '').length;
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0).length;
  const sentences = text.split(/[。！？!?.;；]+/).filter((s) => s.trim().length > 0).length;
  return {
    totalChars: text.length,
    charCount,
    paragraphs,
    sentences,
    readingMinutes: Math.max(charCount > 0 ? 1 : 0, Math.round(charCount / READING_CHARS_PER_MINUTE)),
  };
}

export function computeBookStats(project: Project, now: number = Date.now()): BookStats {
  const chapters = project.chapters ?? [];
  const counted = countableChapters(chapters);
  const totalCharCount = counted.reduce((sum, c) => sum + computeChapterStats(c.content).charCount, 0);
  const writtenChapters = counted.filter((c) => (c.content ?? '').trim().length > 0);

  // 今日新增：每章取今日最早快照与当前内容之差的近似
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const dayStartMs = startOfDay.getTime();
  let todayCharCount = 0;
  for (const chapter of counted) {
    const todaySnapshots = (chapter.snapshots ?? []).filter((s) => s.timestamp >= dayStartMs);
    const baseline = todaySnapshots.length > 0 ? todaySnapshots[0]?.charCount ?? 0 : 0;
    const current = computeChapterStats(chapter.content).charCount;
    if (current > baseline) todayCharCount += current - baseline;
  }

  // 成稿字数与导出走同一管线（默认 profile 的正文文本）
  const { text: builtText } = runBuild(DEFAULT_BUILD_PROFILE, projectToBuildEntities(project));

  return {
    chapterCount: chapters.length,
    writtenChapterCount: writtenChapters.length,
    totalCharCount,
    builtCharCount: computeChapterStats(builtText).charCount,
    todayCharCount,
    averageChapterChars: writtenChapters.length > 0 ? Math.round(totalCharCount / writtenChapters.length) : 0,
  };
}

/** 格式化字数显示（12345 → 1.2万；英文语境显示 1.2×10k） */
export function formatCharCount(count: number): string {
  if (count < 10000) return String(count);
  return `${(count / 10000).toFixed(1)}${i18n.t('writing:stats.wan')}`;
}
