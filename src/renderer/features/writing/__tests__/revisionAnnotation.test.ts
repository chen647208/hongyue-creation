/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 修订与批注的导出/字数边界（docs/design/38 验收）：
 * 接受/拒绝结果写回正文后，字数与导出随之变化；批注为侧车数据，绝不进入正文与导出。
 */
import { describe, expect,it } from 'vitest';

import type { ChapterAnnotation, Project } from '../../../../shared/types';
import { diffChars, mergeRevisionDecisions, uniformDecisions } from '../../../editor/revisionDiff';
import { computeChapterStats } from '../services/writingStatsService';
import { buildExportContent } from '../utils';

const chapter = (content: string, annotations?: ChapterAnnotation[]): Project['chapters'][number] =>
  ({ id: 'c1', title: '第一章', summary: '', content, order: 0, annotations });

const project = (content: string, annotations?: ChapterAnnotation[]): Project =>
  ({
    id: 'b1',
    title: '雾港来信',
    inspiration: '',
    intro: '',
    characters: [],
    outline: '',
    chapters: [chapter(content, annotations)],
    virtualChapters: [],
    knowledge: [],
    lastModified: 1,
  }) as unknown as Project;

const annotation = (): ChapterAnnotation => ({
  id: 'anno1',
  anchor: { blockId: 'blk1', start: 0, end: 2, quote: '林渊' },
  body: '这里需要重写',
  author: 'user',
  createdAt: 1,
  updatedAt: 1,
  resolved: false,
  replies: [],
});

describe('批注不进入导出与字数（硬验收）', () => {
  it('导出结果与无批注时逐字一致，且不含批注正文', () => {
    const withAnnotation = buildExportContent(project('林渊推门。', [annotation()]), new Set(['c1']), 'txt');
    const withoutAnnotation = buildExportContent(project('林渊推门。'), new Set(['c1']), 'txt');
    expect(withAnnotation).toBe(withoutAnnotation);
    expect(withAnnotation).toContain('林渊推门');
    expect(withAnnotation).not.toContain('这里需要重写');
  });

  it('批注不影响章节与全书字数', () => {
    const a = project('林渊推门。', [annotation()]);
    const b = project('林渊推门。');
    expect(computeChapterStats(chapter('林渊推门。').content).charCount).toBe(
      computeChapterStats(chapter('林渊推门。', [annotation()]).content).charCount,
    );
    // 全书成稿字数走同一管线，批注不改变产出文本
    expect(buildExportContent(a, new Set(['c1']), 'txt')).toBe(buildExportContent(b, new Set(['c1']), 'txt'));
  });
});

describe('修订接受/拒绝后字数与导出同步', () => {
  const baseline = '林渊推门。';
  const current = '林渊推门而入。';
  const hunks = diffChars(baseline, current);

  it('全部拒绝保留当前、全部接受采用基线', () => {
    expect(mergeRevisionDecisions(hunks, uniformDecisions(hunks, 'reject'))).toBe(current);
    expect(mergeRevisionDecisions(hunks, uniformDecisions(hunks, 'accept'))).toBe(baseline);
  });

  it('结果写回正文后字数随内容变化', () => {
    const accepted = mergeRevisionDecisions(hunks, uniformDecisions(hunks, 'accept'));
    const rejected = mergeRevisionDecisions(hunks, uniformDecisions(hunks, 'reject'));
    expect(computeChapterStats(accepted).charCount).not.toBe(computeChapterStats(rejected).charCount);
    expect(computeChapterStats(accepted).charCount).toBe(computeChapterStats(baseline).charCount);
    expect(computeChapterStats(rejected).charCount).toBe(computeChapterStats(current).charCount);
  });

  it('结果写回正文后导出随之变化', () => {
    const accepted = mergeRevisionDecisions(hunks, uniformDecisions(hunks, 'accept'));
    const rejected = mergeRevisionDecisions(hunks, uniformDecisions(hunks, 'reject'));
    const acceptedExport = buildExportContent(project(accepted), new Set(['c1']), 'txt');
    const rejectedExport = buildExportContent(project(rejected), new Set(['c1']), 'txt');
    expect(acceptedExport).toContain('林渊推门。');
    expect(acceptedExport).not.toContain('而入');
    expect(rejectedExport).toContain('林渊推门而入。');
  });
});
