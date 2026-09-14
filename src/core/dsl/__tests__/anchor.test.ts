/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { formatBlockAnchor, isBlockAnchorId, isBlockAnchorLine, parseBlockAnchor, stripBlockAnchors } from '../anchor';

describe('块锚语法', () => {
  it('uuidv7 形态的 id 可写可读', () => {
    const id = '0192f0c1-7abc-7def-8123-456789abcdef';
    expect(isBlockAnchorId(id)).toBe(true);
    expect(parseBlockAnchor(formatBlockAnchor(id))).toBe(id);
  });

  it('整行锚允许前后空白；行内出现不算锚', () => {
    expect(isBlockAnchorLine('  ^abc-1  ')).toBe(true);
    expect(parseBlockAnchor('  ^abc-1  ')).toBe('abc-1');
    expect(isBlockAnchorLine('正文 ^abc')).toBe(false);
    expect(isBlockAnchorLine('x^2')).toBe(false);
    expect(isBlockAnchorLine('^')).toBe(false);
    expect(isBlockAnchorLine('^带中文')).toBe(false);
  });

  it('stripBlockAnchors 只删锚行，其余逐字保留；无 ^ 时原样返回', () => {
    const body = '^id-1\n第一段。\n\n^id-2\n## 标题\n\n正文 ^ 字符。';
    expect(stripBlockAnchors(body)).toBe('第一段。\n\n## 标题\n\n正文 ^ 字符。');
    expect(stripBlockAnchors('普通正文\n没有锚')).toBe('普通正文\n没有锚');
  });
});
