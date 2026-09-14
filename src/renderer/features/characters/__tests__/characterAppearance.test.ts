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
import {
  characterAliasesFromIndex,
  findCharacterAppearances,
  normalizeAppearanceNames,
} from '../services/characterAppearance';

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

  it('别名同样计入登场与提及数', () => {
    const chapters = [
      chapter({ id: 'a', title: '开端', order: 0, content: '林砚走进雾港。' }),
      chapter({ id: 'b', title: '重逢', order: 1, content: '林师兄回头，林砚点头。' }),
    ];
    const appearances = findCharacterAppearances('林砚', chapters, ['林师兄']);
    expect(appearances).toEqual([
      { chapterId: 'a', title: '开端', order: 0, mentions: 1 },
      { chapterId: 'b', title: '重逢', order: 1, mentions: 2 },
    ]);
  });

  it('别名去重且忽略空名，主名不重复计数', () => {
    const chapters = [chapter({ id: 'a', content: '林砚' })];
    expect(findCharacterAppearances('林砚', chapters, [' 林砚 ', '', '  '])).toEqual([
      { chapterId: 'a', title: '章', order: 0, mentions: 1 },
    ]);
  });
});

describe('normalizeAppearanceNames', () => {
  it('裁剪去重并保持主名在前', () => {
    expect(normalizeAppearanceNames(' 林砚 ', ['林师兄', '林砚', '  '])).toEqual(['林砚', '林师兄']);
  });

  it('全空返回空数组', () => {
    expect(normalizeAppearanceNames('  ', ['', ' '])).toEqual([]);
  });
});

describe('characterAliasesFromIndex', () => {
  it('主名命中标签声明时取其别名', () => {
    const source = {
      tags: new Map([['林砚', { displayName: '林砚', aliases: ['林师兄', '小砚'] }]]),
      refs: new Map([['林砚', [{ target: '林师兄' }]]]),
    };
    expect(characterAliasesFromIndex('林砚', source).sort()).toEqual(['小砚', '林师兄'].sort());
  });

  it('角色名本身是别名时取主名与其余别名', () => {
    const source = {
      tags: new Map([['林砚', { displayName: '林砚', aliases: ['林师兄', '小砚'] }]]),
      refs: new Map(),
    };
    expect(characterAliasesFromIndex('林师兄', source).sort()).toEqual(['小砚', '林砚'].sort());
  });

  it('引用原文里的别名也纳入', () => {
    const source = {
      tags: new Map([['苏墨', { displayName: '苏墨', aliases: [] }]]),
      refs: new Map([['苏墨', [{ target: '墨先生' }, { target: '苏墨' }]]]),
    };
    expect(characterAliasesFromIndex('苏墨', source)).toEqual(['墨先生']);
  });

  it('空名或索引缺失返回空数组', () => {
    const empty = { tags: new Map(), refs: new Map() };
    expect(characterAliasesFromIndex('  ', empty)).toEqual([]);
    expect(characterAliasesFromIndex('无人', empty)).toEqual([]);
  });
});
