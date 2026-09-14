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
  changeHunks,
  countChanges,
  diffChars,
  mergeRevisionDecisions,
  uniformDecisions,
} from '../revisionDiff';

describe('diffChars', () => {
  it('相同文本返回单个 equal', () => {
    expect(diffChars('林渊推门。', '林渊推门。')).toEqual([
      { id: 'h0', type: 'equal', baselineText: '林渊推门。', currentText: '林渊推门。' },
    ]);
  });

  it('空对空返回空数组', () => {
    expect(diffChars('', '')).toEqual([]);
  });

  it('字符级插入：上下文与插入块分离', () => {
    const hunks = diffChars('你好世界', '你好，世界');
    expect(hunks.map((h) => h.type)).toEqual(['equal', 'insert', 'equal']);
    expect(hunks.map((h) => h.baselineText).join('')).toBe('你好世界');
    expect(hunks.map((h) => h.currentText).join('')).toBe('你好，世界');
    expect(countChanges(hunks)).toBe(1);
  });

  it('字符级删除与替换', () => {
    const del = diffChars('林渊推门而入。', '林渊推门。');
    expect(changeHunks(del).map((h) => h.type)).toEqual(['delete']);
    const rep = diffChars('红色', '蓝色');
    expect(changeHunks(rep).map((h) => h.type)).toEqual(['replace']);
  });

  it('多行增删改重建两侧文本逐字一致', () => {
    const baseline = '第一行\n第二行\n第三行';
    const current = '第一行\n第二行改\n第三行\n第四行';
    const hunks = diffChars(baseline, current);
    const rebuildBaseline = hunks.map((h) => h.baselineText).join('');
    const rebuildCurrent = hunks.map((h) => h.currentText).join('');
    expect(rebuildBaseline).toBe(baseline);
    expect(rebuildCurrent).toBe(current);
  });

  it('全空一侧', () => {
    expect(diffChars('', '新增')).toEqual([{ id: 'h0', type: 'insert', baselineText: '', currentText: '新增' }]);
    expect(diffChars('删除', '')).toEqual([{ id: 'h0', type: 'delete', baselineText: '删除', currentText: '' }]);
  });
});

describe('mergeRevisionDecisions', () => {
  const baseline = '他走进屋子。';
  const current = '他慢慢地走进屋子，四下张望。';
  const hunks = diffChars(baseline, current);

  it('全部拒绝保留当前正文', () => {
    expect(mergeRevisionDecisions(hunks, uniformDecisions(hunks, 'reject'))).toBe(current);
  });

  it('全部接受得到基线文本', () => {
    expect(mergeRevisionDecisions(hunks, uniformDecisions(hunks, 'accept'))).toBe(baseline);
  });

  it('缺省决定为拒绝（不改变当前）', () => {
    expect(mergeRevisionDecisions(hunks)).toBe(current);
  });

  it('逐处混合决定', () => {
    const changes = changeHunks(hunks);
    expect(changes.length).toBeGreaterThan(1);
    const first = changes[0];
    expect(first).toBeDefined();
    const merged = mergeRevisionDecisions(hunks, { [first!.id]: 'accept' });
    expect(merged).not.toBe(current);
    expect(merged.length).toBeGreaterThan(0);
  });

  it('接受表也可用 Map 传入', () => {
    const map = uniformDecisions(hunks, 'accept');
    expect(mergeRevisionDecisions(hunks, map)).toBe(baseline);
  });
});
