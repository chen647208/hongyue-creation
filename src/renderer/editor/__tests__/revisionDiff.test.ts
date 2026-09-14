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
  fromRevisionReviewState,
  mergeRevisionDecisions,
  stepChangeIndex,
  toRevisionReviewState,
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

describe('修订对比中间态持久化', () => {
  it('打包丢弃非法决定，保留标签与基线', () => {
    const state = toRevisionReviewState('快照 12:00', '基线', {
      h0: 'accept',
      h1: 'reject',
      // 非法值不应进入侧车字段
      h2: 'later' as never,
    });
    expect(state).toEqual({ label: '快照 12:00', baseline: '基线', decisions: { h0: 'accept', h1: 'reject' } });
  });

  it('还原中间态并过滤非法决定', () => {
    const restored = fromRevisionReviewState({
      label: '#3',
      baseline: '旧文',
      decisions: { h0: 'reject', h1: 'x' as never },
    });
    expect(restored).toEqual({ label: '#3', text: '旧文', decisions: { h0: 'reject' } });
  });

  it('缺字段返回 null，空基线仍算有效对比', () => {
    expect(fromRevisionReviewState(undefined)).toBeNull();
    expect(fromRevisionReviewState({ label: '', baseline: '', decisions: {} })).toEqual({
      label: '',
      text: '',
      decisions: {},
    });
  });

  it('逐处导航下标夹在有效范围', () => {
    expect(stepChangeIndex(0, 5, -1)).toBe(0);
    expect(stepChangeIndex(0, 5, 1)).toBe(1);
    expect(stepChangeIndex(4, 5, 1)).toBe(4);
    expect(stepChangeIndex(3, 5, 1)).toBe(4);
    expect(stepChangeIndex(0, 0, 1)).toBe(0);
  });

  it('往返后合并结果一致（跨会话续审）', () => {
    const baseline = '他走进屋子。';
    const current = '他慢慢地走进屋子，四下张望。';
    const hunks = diffChars(baseline, current);
    const decisions = uniformDecisions(hunks, 'accept');
    const state = toRevisionReviewState('快照', baseline, Object.fromEntries(decisions));
    const restored = fromRevisionReviewState(state);
    expect(restored).not.toBeNull();
    expect(mergeRevisionDecisions(hunks, restored!.decisions)).toBe(baseline);
  });
});
