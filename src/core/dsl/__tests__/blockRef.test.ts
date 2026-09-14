/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import {
  collectBlockTexts,
  formatBlockEmbed,
  formatBlockRef,
  isBlockEmbedLine,
  isBlockRefId,
  parseBlockEmbedLine,
  parseBlockInline,
  parseBlockRefs,
  resolveBlockRefs,
} from '../blockRef';

describe('块引用/嵌入语法', () => {
  it('格式与解析互逆，id 校验与块锚同源', () => {
    const id = '0192f0c1-7abc-7def-8123-456789abcdef';
    expect(isBlockRefId(id)).toBe(true);
    expect(formatBlockRef(id)).toBe(`((^${id}))`);
    expect(formatBlockEmbed(id)).toBe(`!((^${id}))`);
    expect(isBlockRefId('带中文')).toBe(false);
    expect(isBlockRefId('')).toBe(false);
  });

  it('区分引用与嵌入，按出现顺序给出命中区间', () => {
    const hits = parseBlockInline('前((^a))中!((^b))后');
    expect(hits).toEqual([
      { kind: 'ref', id: 'a', start: 1, end: 7 },
      { kind: 'embed', id: 'b', start: 8, end: 15 },
    ]);
  });

  it('整行嵌入判定：前后空白允许，行内出现不算', () => {
    expect(isBlockEmbedLine('  !((^abc-1))  ')).toBe(true);
    expect(parseBlockEmbedLine('!((^abc-1))')).toBe('abc-1');
    expect(isBlockEmbedLine('正文 !((^abc))')).toBe(false);
    expect(isBlockEmbedLine('!((^))')).toBe(false);
    expect(isBlockEmbedLine('!((^带中文))')).toBe(false);
  });

  it('parseBlockRefs 给出行号并忽略非法 id', () => {
    const body = '第一行 ((^a))\n\n第三行 !((^b)) 与 ((^c))\n!((^非法))';
    expect(parseBlockRefs(body)).toEqual([
      { kind: 'ref', id: 'a', line: 1 },
      { kind: 'embed', id: 'b', line: 3 },
      { kind: 'ref', id: 'c', line: 3 },
    ]);
  });
});

describe('collectBlockTexts：按块锚取块可见文本', () => {
  it('锚行归属其后块；标题/关键字/场景分隔各自成块', () => {
    const body = [
      '^p1',
      '第一段。',
      '',
      '^h1',
      '## 标题',
      '',
      '^k1',
      '# @pov: 林渊',
      '',
      '^s1',
      '***',
    ].join('\n');
    const texts = collectBlockTexts([body]);
    expect(texts.get('p1')).toBe('第一段。');
    expect(texts.get('h1')).toBe('## 标题');
    expect(texts.get('k1')).toBe('# @pov: 林渊');
    expect(texts.get('s1')).toBe('***');
  });

  it('多段软换行段落整块取回；同 id 以首份为准', () => {
    const texts = collectBlockTexts(['^a\n上\n下', '^a\n覆盖', '^b\n乙']);
    expect(texts.get('a')).toBe('上\n下');
    expect(texts.get('b')).toBe('乙');
  });

  it('转义的块级语法行按字面文本还原', () => {
    const texts = collectBlockTexts(['^a\n\\!((^b))\n\\^x']);
    expect(texts.get('a')).toBe('!((^b))\n^x');
  });
});

describe('resolveBlockRefs：导出展开', () => {
  const texts = new Map<string, string>([
    ['a', '甲段文本'],
    ['b', '乙段引用((^a))'],
  ]);

  it('引用与嵌入都展开为被引块文本，产物无残留语法', () => {
    const out = resolveBlockRefs('看这里((^a))还有!((^a))。', texts);
    expect(out).toBe('看这里甲段文本还有甲段文本。');
    expect(out).not.toContain('((^');
  });

  it('嵌入递归展开嵌套引用', () => {
    expect(resolveBlockRefs('!((^b))', texts)).toBe('乙段引用甲段文本');
  });

  it('目标缺失写失链标记，可自定义', () => {
    expect(resolveBlockRefs('((^missing))', texts)).toBe('【失链：missing】');
    expect(resolveBlockRefs('((^missing))', texts, { broken: (id) => `[broken:${id}]` })).toBe('[broken:missing]');
  });

  it('成环时截断，不死循环', () => {
    const cyclic = new Map<string, string>([
      ['x', 'x 引用 ((^y))'],
      ['y', 'y 引用 ((^x))'],
    ]);
    expect(resolveBlockRefs('((^x))', cyclic)).toBe('x 引用 y 引用 【循环引用：x】');
  });

  it('无语法时原样返回', () => {
    expect(resolveBlockRefs('普通正文。', texts)).toBe('普通正文。');
    expect(resolveBlockRefs('公式 x^2', texts)).toBe('公式 x^2');
  });
});
