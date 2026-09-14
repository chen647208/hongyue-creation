/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Chapter, Project } from '@shared/types';
import { describe, expect,it } from 'vitest';

import {
  applyOutlineDrafts,
  buildChapterContextBlock,
  buildExtractionPrompt,
  type OutlineDraft,
  parseChapterOrdinal,
  parseChaptersFromAI,
  parseExtractionResult,
} from '../chapterOutline';

const fallbacks = { titleFor: (n: number) => `第${n}章`, defaultSummary: '（无）' };

describe('parseChaptersFromAI', () => {
  it('解析标题与细纲，order 从 startIndex 递增', () => {
    const text = '第一章：开端\n剧情细纲：主角登场\n---\n第二章 冲突\n内容：矛盾升级';
    const out = parseChaptersFromAI(text, 0, fallbacks);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: '开端', summary: '主角登场', order: 0 });
    expect(out[1]).toMatchObject({ title: '冲突', summary: '矛盾升级', order: 1 });
    expect(out[0]!.id).toBeTruthy();
  });

  it('细纲为空时回落默认文案', () => {
    const out = parseChaptersFromAI('第一章：标题\n剧情细纲：', 0, fallbacks);
    expect(out[0]!.title).toBe('标题');
    expect(out[0]!.summary).toBe('（无）');
  });

  it('startIndex 影响生成序号', () => {
    const out = parseChaptersFromAI('第一章：甲\n剧情细纲：A', 5, fallbacks);
    expect(out[0]!.order).toBe(5);
  });
});

describe('buildChapterContextBlock', () => {
  it('含书名、简介与人物', () => {
    const project = {
      title: '测试书', intro: '简介文', characters: [{ name: '林川', role: 'protagonist', personality: '冷静' }],
    } as unknown as Project;
    const block = buildChapterContextBlock(project);
    expect(block).toContain('书名：《测试书》');
    expect(block).toContain('简介：简介文');
    expect(block).toContain('林川');
  });
});

function chapterOf(id: string, order: number, title: string, content: string, summary = ''): Chapter {
  return { id, order, title, content, summary };
}

const draftChapters: Chapter[] = [
  chapterOf('ch0', 0, '启程', '主角离开家乡，踏上旅途。'),
  chapterOf('ch1', 1, '冲突', '主角与宿敌正面相遇。'),
];

describe('parseChapterOrdinal', () => {
  it('支持阿拉伯数字', () => {
    expect(parseChapterOrdinal('12')).toBe(12);
  });

  it('支持中文数字', () => {
    expect(parseChapterOrdinal('十')).toBe(10);
    expect(parseChapterOrdinal('十二')).toBe(12);
    expect(parseChapterOrdinal('二十')).toBe(20);
    expect(parseChapterOrdinal('一百零二')).toBe(102);
  });

  it('无法解析返回 NaN', () => {
    expect(Number.isNaN(parseChapterOrdinal('abc'))).toBe(true);
    expect(Number.isNaN(parseChapterOrdinal(''))).toBe(true);
  });
});

describe('buildExtractionPrompt', () => {
  it('按 order+1 编号并包含标题、正文与输出格式', () => {
    const prompt = buildExtractionPrompt(draftChapters);
    expect(prompt).toContain('第1章 启程');
    expect(prompt).toContain('第2章 冲突');
    expect(prompt).toContain('主角离开家乡');
    expect(prompt).toContain('细纲：');
    expect(prompt).toContain('---');
  });

  it('跳过无正文章节并按上限截断', () => {
    const chapters = [chapterOf('ch0', 0, '空章', '', ''), chapterOf('ch1', 1, '长章', 'x'.repeat(50))];
    const prompt = buildExtractionPrompt(chapters, { perChapterCharLimit: 10 });
    expect(prompt).not.toContain('空章');
    expect(prompt).toContain('第2章 长章');
    expect(prompt).toContain('x'.repeat(10));
    expect(prompt).not.toContain('x'.repeat(11));
  });
});

describe('parseExtractionResult', () => {
  it('按序号映射既有章节，标题沿用既有值', () => {
    const text = '第1章 起点\n细纲：主角出发\n---\n第2章 变故\n细纲：矛盾升级';
    const drafts = parseExtractionResult(text, draftChapters);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ chapterId: 'ch0', order: 0, title: '启程', summary: '主角出发' });
    expect(drafts[1]).toMatchObject({ chapterId: 'ch1', order: 1, title: '冲突', summary: '矛盾升级' });
  });

  it('支持中文序号', () => {
    const drafts = parseExtractionResult('第一章 起点\n细纲：甲', draftChapters);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.chapterId).toBe('ch0');
  });

  it('忽略未命中章节与空细纲', () => {
    const text = '第9章 无关\n细纲：无对应章节\n---\n第1章 起点\n细纲：';
    expect(parseExtractionResult(text, draftChapters)).toHaveLength(0);
  });

  it('按 order 升序返回', () => {
    const text = '第2章 后\n细纲：后\n---\n第1章 前\n细纲：前';
    const drafts = parseExtractionResult(text, draftChapters);
    expect(drafts.map((d) => d.order)).toEqual([0, 1]);
  });
});

describe('applyOutlineDrafts', () => {
  const drafts: OutlineDraft[] = [
    { chapterId: 'ch0', order: 0, title: '启程', summary: '提取的细纲A' },
    { chapterId: 'ch1', order: 1, title: '冲突', summary: '提取的细纲B' },
  ];

  it('写入空白细纲且不改动入参', () => {
    const chapters = [chapterOf('ch0', 0, '启程', '正文'), chapterOf('ch1', 1, '冲突', '正文', '既有细纲')];
    const result = applyOutlineDrafts(chapters, drafts);
    expect(result.appliedIds).toEqual(['ch0']);
    expect(result.skippedExistingIds).toEqual(['ch1']);
    expect(result.chapters[0]!.summary).toBe('提取的细纲A');
    expect(result.chapters[1]!.summary).toBe('既有细纲');
    expect(chapters[0]!.summary).toBe('');
  });

  it('只应用选中项', () => {
    const chapters = [chapterOf('ch0', 0, '启程', '正文'), chapterOf('ch1', 1, '冲突', '正文')];
    const result = applyOutlineDrafts(chapters, drafts, { selectedIds: new Set(['ch1']) });
    expect(result.appliedIds).toEqual(['ch1']);
    expect(result.chapters[0]!.summary).toBe('');
    expect(result.chapters[1]!.summary).toBe('提取的细纲B');
  });

  it('无草稿时原样返回', () => {
    const chapters = [chapterOf('ch0', 0, '启程', '正文')];
    const result = applyOutlineDrafts(chapters, []);
    expect(result.appliedIds).toEqual([]);
    expect(result.chapters).toEqual(chapters);
  });
});
