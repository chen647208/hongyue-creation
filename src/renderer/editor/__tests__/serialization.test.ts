/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { BLOCK_ID_ATTRIBUTE, dslToPmDoc, pmDocToDsl, type PmNode } from '../serialization';

function topTypes(doc: PmNode): string[] {
  return (doc.content ?? []).map((b) => b.type);
}
describe('dslToPmDoc', () => {
  it('段落/标题/场景分隔/关键字行分类正确', () => {
    const doc = dslToPmDoc('# @pov: 林渊\n\n第一段。\n\n## 小节\n\n正文。\n\n***\n\n新场景。');
    expect(topTypes(doc)).toEqual(['keywordLine', 'paragraph', 'heading', 'paragraph', 'sceneBreak', 'paragraph']);
  });

  it('关键字行与真标题以 @ 区分', () => {
    const kw = dslToPmDoc('# @strand: 主线A').content?.[0];
    expect(kw?.type).toBe('keywordLine');
    expect(kw?.attrs).toMatchObject({ keyword: 'strand', value: '主线A' });
    const h = dslToPmDoc('# 真正的标题').content?.[0];
    expect(h?.type).toBe('heading');
    expect(h?.attrs).toMatchObject({ level: 1 });
  });

  it('行内 [[硬链接]] 解析为 chapterRef（含别名）', () => {
    const para = dslToPmDoc('他去了[[云都]]和[[旧都|废都]]。').content?.[0];
    const types = (para?.content ?? []).map((n) => n.type);
    expect(types).toEqual(['text', 'chapterRef', 'text', 'chapterRef', 'text']);
    const refs = (para?.content ?? []).filter((n) => n.type === 'chapterRef');
    expect(refs[0]?.attrs).toMatchObject({ tag: '云都', display: null });
    expect(refs[1]?.attrs).toMatchObject({ tag: '旧都', display: '废都' });
  });

  it('行内 {占位符} 解析为 placeholder（含类型）', () => {
    const para = dslToPmDoc('此处填{主角名|name}。').content?.[0];
    const ph = (para?.content ?? []).find((n) => n.type === 'placeholder');
    expect(ph?.attrs).toMatchObject({ name: '主角名', kind: 'name' });
  });

  it('段内软换行保留为 hardBreak', () => {
    const para = dslToPmDoc('第一行\n第二行').content?.[0];
    expect((para?.content ?? []).some((n) => n.type === 'hardBreak')).toBe(true);
  });

  it('空正文得到单个空段落', () => {
    const doc = dslToPmDoc('');
    expect(topTypes(doc)).toEqual(['paragraph']);
  });
});

describe('pmDocToDsl', () => {
  it('canonical DSL 文本往返稳定（parse→serialize 幂等）', () => {
    const canonical = [
      '# @pov: 林渊',
      '',
      '他走进了[[云都]]的城门。',
      '',
      '这是第二段，提到[[云都|帝都]]和{name|fact}占位。',
      '',
      '***',
      '',
      '新场景开始。',
    ].join('\n');
    expect(pmDocToDsl(dslToPmDoc(canonical))).toBe(canonical);
  });

  it('二次往返结构不变（serialize→parse→serialize 稳定）', () => {
    const src = '# @tag: 林渊 | 林师兄\n\n正文含[[林渊]]。\n\n## 标题\n\n段落二。';
    const once = pmDocToDsl(dslToPmDoc(src));
    const twice = pmDocToDsl(dslToPmDoc(once));
    expect(twice).toBe(once);
  });

  it('标题级别还原为对应 # 数', () => {
    const dsl = pmDocToDsl(dslToPmDoc('### 三级'));
    expect(dsl.startsWith('### 三级')).toBe(true);
  });
});

describe('块前缀转义（往返保真，段落不被误解析为块级语法）', () => {
  const paraDoc = (text: string): PmNode => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });

  it('以 # 开头的段落序列化为 \\\\# 并在重载后仍是段落', () => {
    const dsl = pmDocToDsl(paraDoc('# 这不是标题'));
    expect(dsl).toBe('\\# 这不是标题');
    const reloaded = dslToPmDoc(dsl);
    expect(topTypes(reloaded)).toEqual(['paragraph']);
    expect(reloaded.content?.[0]?.content?.[0]?.text).toBe('# 这不是标题');
  });

  it('*** 与 # @ 前缀段落同样转义保真', () => {
    for (const text of ['***', '# @pov: 伪关键字', '## 伪二级']) {
      const dsl = pmDocToDsl(paraDoc(text));
      const reloaded = dslToPmDoc(dsl);
      expect(topTypes(reloaded)).toEqual(['paragraph']);
      expect(reloaded.content?.[0]?.content?.[0]?.text).toBe(text);
    }
  });

  it('转义后二次往返幂等（不会重复加反斜杠）', () => {
    const once = pmDocToDsl(paraDoc('# 标题样文本'));
    const twice = pmDocToDsl(dslToPmDoc(once));
    expect(twice).toBe(once);
  });

  it('普通段落不加反斜杠；非冲突的前导反斜杠原样保留', () => {
    expect(pmDocToDsl(paraDoc('正常段落。'))).toBe('正常段落。');
    const dsl = pmDocToDsl(paraDoc('\\不是块语法'));
    expect(dsl).toBe('\\不是块语法');
    expect(dslToPmDoc(dsl).content?.[0]?.content?.[0]?.text).toBe('\\不是块语法');
  });

  it('段内软换行的冲突行逐行转义', () => {
    const doc: PmNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'text', text: '上行' },
        { type: 'hardBreak' },
        { type: 'text', text: '# 下行伪标题' },
      ] }],
    };
    const dsl = pmDocToDsl(doc);
    expect(dsl).toBe('上行\n\\# 下行伪标题');
    const reloaded = dslToPmDoc(dsl);
    expect(topTypes(reloaded)).toEqual(['paragraph']);
    expect(reloaded.content?.[0]?.content?.map((n) => n.text ?? n.type)).toEqual(['上行', 'hardBreak', '# 下行伪标题']);
  });
});

describe('块引用与块嵌入往返', () => {
  it('行内引用/嵌入解析为 blockRef/blockEmbed，渲染回原语法', () => {
    const doc = dslToPmDoc('见 ((^abc-1)) 与 !((^def-2))。');
    const types = (doc.content?.[0]?.content ?? []).map((n) => n.type);
    expect(types).toEqual(['text', 'blockRef', 'text', 'blockEmbed', 'text']);
    expect(doc.content?.[0]?.content?.[1]?.attrs).toMatchObject({ id: 'abc-1' });
    expect(doc.content?.[0]?.content?.[3]?.attrs).toMatchObject({ id: 'def-2' });
    expect(pmDocToDsl(doc)).toBe('见 ((^abc-1)) 与 !((^def-2))。');
  });

  it('整行嵌入为块级 blockEmbed，带块锚往返稳定', () => {
    const doc: PmNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { [BLOCK_ID_ATTRIBUTE]: 'src-1' }, content: [{ type: 'text', text: '甲' }] },
        { type: 'blockEmbed', attrs: { [BLOCK_ID_ATTRIBUTE]: 'e1', id: 'src-1' } },
      ],
    };
    const dsl = pmDocToDsl(doc);
    expect(dsl).toBe('^src-1\n甲\n\n^e1\n!((^src-1))');
    const reloaded = dslToPmDoc(dsl);
    expect(reloaded.content?.[1]?.type).toBe('blockEmbed');
    expect(reloaded.content?.[1]?.attrs).toMatchObject({ id: 'src-1', [BLOCK_ID_ATTRIBUTE]: 'e1' });
    expect(pmDocToDsl(reloaded)).toBe(dsl);
  });

  it('段落整行恰为嵌入形时转义，结构不塌成块级嵌入', () => {
    const doc: PmNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '!((^abc-1))' }] }],
    };
    const dsl = pmDocToDsl(doc);
    expect(dsl).toBe('\\!((^abc-1))');
    const reloaded = dslToPmDoc(dsl);
    expect(topTypes(reloaded)).toEqual(['paragraph']);
    expect(reloaded.content?.[0]?.content?.[0]?.type).toBe('blockEmbed');
    expect(pmDocToDsl(reloaded)).toBe(dsl);
  });
});
