/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { classifyScreenplayLine } from '../screenplay';

describe('classifyScreenplayLine', () => {
  it('识别场景头（中英）', () => {
    expect(classifyScreenplayLine('INT. CAFE - DAY')).toBe('scene_heading');
    expect(classifyScreenplayLine('EXT. 街道 - 夜')).toBe('scene_heading');
    expect(classifyScreenplayLine('内景 客厅 - 日')).toBe('scene_heading');
  });

  it('识别角色名（全大写英文与中文冒号）', () => {
    expect(classifyScreenplayLine('ANNA')).toBe('character');
    expect(classifyScreenplayLine('小明：')).toBe('character');
  });

  it('识别括号提示与转场', () => {
    expect(classifyScreenplayLine('（低语）')).toBe('parenthetical');
    expect(classifyScreenplayLine('(beat)')).toBe('parenthetical');
    expect(classifyScreenplayLine('CUT TO:')).toBe('transition');
    expect(classifyScreenplayLine('切至')).toBe('transition');
  });

  it('普通句子归为动作', () => {
    expect(classifyScreenplayLine('她推开门走了进去。')).toBe('action');
    expect(classifyScreenplayLine('')).toBe('action');
  });
});
