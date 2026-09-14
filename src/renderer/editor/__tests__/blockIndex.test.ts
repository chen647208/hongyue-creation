/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { BLOCK_ID_ATTRIBUTE, BLOCK_SUMMARY_MAX_LENGTH, blockText, collectBlockIds, findBlockById, listBlocks, listBlocksFromBody } from '../blockIndex';
import { dslToPmDoc, type PmNode } from '../serialization';

describe('blockText 摘要纯函数', () => {
  it('段落拼接行内文本，引用取显示名、占位符取名字', () => {
    const node: PmNode = {
      type: 'paragraph',
      content: [
        { type: 'text', text: '他去了' },
        { type: 'chapterRef', attrs: { tag: '云都', display: '帝都' } },
        { type: 'text', text: '并留下' },
        { type: 'chapterRef', attrs: { tag: '旧都', display: null } },
        { type: 'placeholder', attrs: { name: '信物', kind: 'fact' } },
      ],
    };
    expect(blockText(node)).toBe('他去了帝都并留下旧都{信物|fact}');
  });

  it('软换行记为换行符', () => {
    const node: PmNode = {
      type: 'paragraph',
      content: [{ type: 'text', text: '上' }, { type: 'hardBreak' }, { type: 'text', text: '下' }],
    };
    expect(blockText(node)).toBe('上\n下');
  });

  it('场景分隔与关键字行有固定文本', () => {
    expect(blockText({ type: 'sceneBreak' })).toBe('***');
    expect(blockText({ type: 'keywordLine', attrs: { keyword: 'pov', value: '林渊' } })).toBe('# @pov: 林渊');
    expect(blockText({ type: 'darlingSlot', attrs: { text: '被弃的桥段' } })).toBe('被弃的桥段');
  });

  it('块引用与嵌入按原语法入摘要', () => {
    expect(blockText({ type: 'blockEmbed', attrs: { id: 'a1' } })).toBe('!((^a1))');
    const para: PmNode = {
      type: 'paragraph',
      content: [{ type: 'text', text: '见' }, { type: 'blockRef', attrs: { id: 'b2' } }],
    };
    expect(blockText(para)).toBe('见((^b2))');
  });
});

describe('listBlocks / findBlockById / collectBlockIds', () => {
  const doc: PmNode = {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { [BLOCK_ID_ATTRIBUTE]: 'b1' }, content: [{ type: 'text', text: '第一段' }] },
      { type: 'sceneBreak', attrs: { [BLOCK_ID_ATTRIBUTE]: 'b2' } },
      { type: 'paragraph', content: [{ type: 'text', text: '无标识段' }] },
    ],
  };

  it('读取属性中的标识，缺失记为 null', () => {
    expect(listBlocks(doc).map((block) => block.id)).toEqual(['b1', 'b2', null]);
    expect(listBlocks(doc).map((block) => block.type)).toEqual(['paragraph', 'sceneBreak', 'paragraph']);
  });

  it('findBlockById 命中/未命中', () => {
    expect(findBlockById(doc, 'b2')?.text).toBe('***');
    expect(findBlockById(doc, 'missing')).toBeNull();
  });

  it('collectBlockIds 只返回已存在的标识', () => {
    expect(collectBlockIds(doc)).toEqual(['b1', 'b2']);
  });

  it('摘要按上限截断并追加省略号', () => {
    const long = '字'.repeat(BLOCK_SUMMARY_MAX_LENGTH + 10);
    const node: PmNode = { type: 'paragraph', content: [{ type: 'text', text: long }] };
    const summary = listBlocks({ type: 'doc', content: [node] })[0]?.text ?? '';
    expect(summary.length).toBe(BLOCK_SUMMARY_MAX_LENGTH + 1);
    expect(summary.endsWith('…')).toBe(true);
  });
});

describe('listBlocksFromBody（DSL 文本入口）', () => {
  it('解析正文并给出摘要；DSL 不携带标识，id 为 null', () => {
    const records = listBlocksFromBody('# @pov: 林渊\n\n他走进城门。\n\n***\n\n新场景。');
    expect(records.map((r) => r.type)).toEqual(['keywordLine', 'paragraph', 'sceneBreak', 'paragraph']);
    expect(records.map((r) => r.text)).toEqual(['# @pov: 林渊', '他走进城门。', '***', '新场景。']);
    expect(records.every((r) => r.id === null)).toBe(true);
  });

  it('与 dslToPmDoc 的块结构一致', () => {
    const body = '一\n\n二\n\n三';
    expect(listBlocksFromBody(body)).toHaveLength(listBlocks(dslToPmDoc(body)).length);
  });
});
