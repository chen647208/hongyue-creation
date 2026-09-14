/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import { describe, expect, it } from 'vitest';

import type { Chapter } from '../../../../shared/types';
import { findCharacterAppearances } from '../services/characterAppearance';

const chapter = (over: Partial<Chapter>): Pick<Chapter, 'id' | 'title' | 'order' | 'content'> => ({
  id: 'ch',
  title: '章',
  order: 0,
  content: '',
  ...over,
});

describe('findCharacterAppearances', () => {
  it('空名返回空列表，不匹配任何章节', () => {
    const chapters = [chapter({ id: 'a', content: '林砚登场' })];
    expect(findCharacterAppearances('', chapters)).toEqual([]);
    expect(findCharacterAppearances('   ', chapters)).toEqual([]);
  });

  it('只返回正文出现角色名的章节，并记录出现次数', () => {
    const chapters = [
      chapter({ id: 'a', title: '开端', order: 0, content: '林砚走进雾港。' }),
      chapter({ id: 'b', title: '缺席', order: 1, content: '这里只有旁人。' }),
      chapter({ id: 'c', title: '重逢', order: 2, content: '林砚对林砚说。' }),
    ];
    expect(findCharacterAppearances('林砚', chapters)).toEqual([
      { chapterId: 'a', title: '开端', order: 0, mentions: 1 },
      { chapterId: 'c', title: '重逢', order: 2, mentions: 2 },
    ]);
  });

  it('按 order 升序排序，不依赖数组原始顺序', () => {
    const chapters = [
      chapter({ id: 'late', title: '后章', order: 9, content: '甲' }),
      chapter({ id: 'early', title: '前章', order: 2, content: '甲' }),
      chapter({ id: 'mid', title: '中章', order: 5, content: '甲' }),
    ];
    expect(findCharacterAppearances('甲', chapters).map((e) => e.chapterId)).toEqual([
      'early',
      'mid',
      'late',
    ]);
  });

  it('order 相同时按传入数组顺序稳定排序', () => {
    const chapters = [
      chapter({ id: 'first', order: 1, content: '乙' }),
      chapter({ id: 'second', order: 1, content: '乙' }),
    ];
    expect(findCharacterAppearances('乙', chapters).map((e) => e.chapterId)).toEqual([
      'first',
      'second',
    ]);
  });

  it('名字前后空格被裁剪，大小写敏感', () => {
    const chapters = [
      chapter({ id: 'zh', content: '林砚' }),
      chapter({ id: 'en', content: 'Alice met alice.' }),
    ];
    expect(findCharacterAppearances(' 林砚 ', chapters).map((e) => e.chapterId)).toEqual(['zh']);
    expect(findCharacterAppearances('Alice', chapters)).toEqual([
      { chapterId: 'en', title: '章', order: 0, mentions: 1 },
    ]);
  });

  it('空内容章节不产生命中', () => {
    const chapters = [chapter({ id: 'empty', content: '' })];
    expect(findCharacterAppearances('林砚', chapters)).toEqual([]);
  });
});
