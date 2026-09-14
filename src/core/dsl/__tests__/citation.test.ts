/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { formatCitation, formatFootnote, parseCitations, parseFootnotes } from '../citation';

describe('引文语法解析', () => {
  it('解析单条引用与定位', () => {
    const hits = parseCitations('见 [@doe2020] 与 [@smith|p. 33]。');
    expect(hits).toHaveLength(2);
    expect(hits[0]?.items).toEqual([{ key: 'doe2020' }]);
    expect(hits[1]?.items).toEqual([{ key: 'smith', locator: 'p. 33' }]);
    expect(hits[0]?.start).toBe(2);
  });

  it('一处引用多条来源', () => {
    const hits = parseCitations('综述 [@a; @b; @c|第2章]。');
    expect(hits[0]?.items).toEqual([{ key: 'a' }, { key: 'b' }, { key: 'c', locator: '第2章' }]);
  });

  it('非引文的方括号不命中', () => {
    expect(parseCitations('普通 [链接](url) 与 [标注]。')).toEqual([]);
  });

  it('formatCitation 往返', () => {
    expect(formatCitation('doe2020')).toBe('[@doe2020]');
    expect(formatCitation('doe2020', 'p. 5')).toBe('[@doe2020|p. 5]');
  });
});

describe('脚注语法解析', () => {
  it('解析行内脚注并保留位置', () => {
    const hits = parseFootnotes('正文^[第一条]。');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content).toBe('第一条');
    expect(hits[0]?.start).toBe(2);
  });

  it('反斜杠转义按字面处理', () => {
    expect(parseFootnotes('字面 \\^[不是脚注]')).toEqual([]);
    expect(formatFootnote('注')).toBe('^[注]');
  });

  it('跨行不匹配', () => {
    expect(parseFootnotes('^[没有闭合\n下一行]')).toEqual([]);
  });
});
