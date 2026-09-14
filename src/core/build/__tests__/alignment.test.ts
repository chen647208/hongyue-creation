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
  alignmentStats,
  alignParagraphs,
  setPairConfirmed,
  setPairTarget,
  splitParagraphs,
} from '../index.js';

describe('对照视图：段落对齐与确认状态', () => {
  it('按空行拆段', () => {
    expect(splitParagraphs('一段。\n\n二段。\n \n')).toEqual(['一段。', '二段。']);
  });

  it('初次对齐按段序配对，确认状态默认未确认', () => {
    const pairs = alignParagraphs([], '原文一\n\n原文二', '译文一\n\n译文二');
    expect(pairs.map((pair) => [pair.source, pair.target, pair.confirmed])).toEqual([
      ['原文一', '译文一', false],
      ['原文二', '译文二', false],
    ]);
  });

  it('确认状态可持久化：同一段两侧未变时重算后保留', () => {
    const first = alignParagraphs([], '原文一\n\n原文二', '译文一\n\n译文二');
    const confirmed = setPairConfirmed({ pairs: first }, 'pair:1', true);
    expect(alignmentStats(confirmed)).toEqual({ total: 2, confirmed: 1 });
    const realigned = alignParagraphs(confirmed.pairs, '原文一\n\n原文二', '译文一\n\n译文二');
    expect(realigned[0]?.confirmed).toBe(true);
    expect(realigned[1]?.confirmed).toBe(false);
  });

  it('正文变动后该段确认失效', () => {
    const first = alignParagraphs([], '原文一', '译文一');
    const confirmed = setPairConfirmed({ pairs: first }, 'pair:1', true);
    const realigned = alignParagraphs(confirmed.pairs, '原文一改', '译文一');
    expect(realigned[0]?.confirmed).toBe(false);
  });

  it('改写译文使确认失效', () => {
    const first = alignParagraphs([], '原文一', '译文一');
    const confirmed = setPairConfirmed({ pairs: first }, 'pair:1', true);
    const edited = setPairTarget(confirmed, 'pair:1', '新译文');
    expect(edited.pairs[0]?.target).toBe('新译文');
    expect(edited.pairs[0]?.confirmed).toBe(false);
  });
});
