/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { ChapterSnapshot, RevisionReviewState } from '../../../shared/types';
import {
  changeHunks,
  countChanges,
  diffChars,
  fromRevisionReviewState,
  matchRevisionBaseline,
  matchSnapshotBaseline,
  mergeRevisionDecisions,
  stepChangeIndex,
  toRevisionReviewState,
  uniformDecisions,
  withBaselineRef,
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
  /** 章节快照数组顺序稳定；两条正文相同，迁移按首个命中。 */
  const SNAPSHOTS: ChapterSnapshot[] = [
    { id: 'snap_a', content: '旧文', timestamp: 1, charCount: 2, source: 'manual' },
    { id: 'snap_b', content: '旧文', timestamp: 2, charCount: 2, source: 'manual' },
    { id: 'snap_c', content: '另一版', timestamp: 3, charCount: 3, source: 'auto' },
  ];
  /** 修订记录按 seq 升序（与 repository.loadRevisions 口径一致）。 */
  const REVISIONS = [
    { id: 'rev_1', body: '旧文', seq: 1 },
    { id: 'rev_2', body: '新文', seq: 2 },
  ];

  it('打包丢弃非法决定，基线按快照 id 引用写入且不夹带正文副本', () => {
    const state = toRevisionReviewState('快照 12:00', { source: 'snapshot', id: 'snap_a' }, {
      h0: 'accept',
      h1: 'reject',
      // 非法值不应进入侧车字段
      h2: 'later' as never,
    });
    expect(state).toEqual({
      label: '快照 12:00',
      baselineRef: { source: 'snapshot', id: 'snap_a' },
      decisions: { h0: 'accept', h1: 'reject' },
    });
    expect(Object.keys(state)).not.toContain('baseline');
  });

  it('新格式读回：快照引用解析出全文与逐处决定', () => {
    const state = toRevisionReviewState('快照 12:00', { source: 'snapshot', id: 'snap_a' }, { h0: 'accept' });
    expect(fromRevisionReviewState(state, { snapshots: SNAPSHOTS })).toEqual({
      label: '快照 12:00',
      baseline: { source: 'snapshot', id: 'snap_a' },
      text: '旧文',
      fallbackText: null,
      decisions: { h0: 'accept' },
    });
  });

  it('新格式读回：修订引用标记为待异步载入（正文在 revisions 表）', () => {
    const state = toRevisionReviewState('#3', { source: 'revision', id: 'rev_1' }, { h0: 'reject' });
    const restored = fromRevisionReviewState(state, { snapshots: SNAPSHOTS });
    expect(restored?.text).toBeNull();
    expect(restored?.baseline).toEqual({ source: 'revision', id: 'rev_1' });
    expect(restored?.decisions).toEqual({ h0: 'reject' });
  });

  it('引用失效回落全文：快照已删且字段留有兜底正文', () => {
    const restored = fromRevisionReviewState(
      {
        label: '快照 12:00',
        baselineRef: { source: 'snapshot', id: 'snap_deleted' },
        baseline: '旧文',
        decisions: { h0: 'reject' },
      },
      { snapshots: SNAPSHOTS },
    );
    expect(restored).toEqual({
      label: '快照 12:00',
      baseline: { source: 'inline', text: '旧文' },
      text: '旧文',
      fallbackText: '旧文',
      decisions: { h0: 'reject' },
    });
  });

  it('引用失效且无兜底正文：返回 null（对比结束）', () => {
    expect(
      fromRevisionReviewState({ label: '快照', baselineRef: { source: 'snapshot', id: 'snap_deleted' }, decisions: {} }, {
        snapshots: SNAPSHOTS,
      }),
    ).toBeNull();
    expect(
      fromRevisionReviewState({ label: '快照', baselineRef: { source: 'revision', id: 'rev_gone' }, decisions: {} }),
    ).toEqual({
      label: '快照',
      baseline: { source: 'revision', id: 'rev_gone' },
      text: null,
      fallbackText: null,
      decisions: {},
    });
  });

  it('缺字段返回 null，空基线仍算有效对比', () => {
    expect(fromRevisionReviewState(undefined)).toBeNull();
    expect(fromRevisionReviewState({ label: 'x', decisions: {} })).toBeNull();
    expect(fromRevisionReviewState({ label: '', baseline: '', decisions: {} })).toEqual({
      label: '',
      baseline: { source: 'inline', text: '' },
      text: '',
      fallbackText: '',
      decisions: {},
    });
  });

  it('读时迁移：历史全文按正文匹配快照 id（多快照同正文取首个）', () => {
    const legacy: RevisionReviewState = { label: '快照 12:00', baseline: '旧文', decisions: { h0: 'accept' } };
    const ref = matchSnapshotBaseline({ snapshots: SNAPSHOTS }, legacy.baseline as string);
    expect(ref).toEqual({ source: 'snapshot', id: 'snap_a' });
    const migrated = withBaselineRef(legacy, ref as NonNullable<typeof ref>);
    expect(migrated).toEqual({
      label: '快照 12:00',
      baselineRef: { source: 'snapshot', id: 'snap_a' },
      decisions: { h0: 'accept' },
    });
    expect(migrated.baseline).toBeUndefined();
  });

  it('读时迁移：历史全文按正文匹配修订 id，匹配不到返回 null', () => {
    expect(matchRevisionBaseline(REVISIONS, '旧文')).toEqual({ source: 'revision', id: 'rev_1' });
    expect(matchRevisionBaseline(REVISIONS, '没有任何版本匹配')).toBeNull();
    expect(matchSnapshotBaseline({ snapshots: SNAPSHOTS }, '没有任何快照匹配')).toBeNull();
  });

  it('读时迁移：匹配不到 id 的历史数据保留全文兜底', () => {
    const legacy: RevisionReviewState = { label: '#9', baseline: '手改过的基线', decisions: { h0: 'reject' } };
    expect(matchSnapshotBaseline({ snapshots: SNAPSHOTS }, legacy.baseline as string)).toBeNull();
    expect(matchRevisionBaseline(REVISIONS, legacy.baseline as string)).toBeNull();
    const restored = fromRevisionReviewState(legacy, { snapshots: SNAPSHOTS });
    expect(restored?.baseline).toEqual({ source: 'inline', text: '手改过的基线' });
    expect(restored?.text).toBe('手改过的基线');
  });

  it('迁移后行为等价：续审恢复、逐处合并与迁移前一致', () => {
    const baseline = '他走进屋子。';
    const current = '他慢慢地走进屋子，四下张望。';
    const hunks = diffChars(baseline, current);
    const legacy: RevisionReviewState = { label: '快照 12:00', baseline, decisions: { h0: 'accept' } };
    const chapter = { snapshots: [...SNAPSHOTS, { id: 'snap_d', content: baseline, timestamp: 4, charCount: 6, source: 'manual' as const }] };

    const before = fromRevisionReviewState(legacy, chapter);
    expect(before).not.toBeNull();

    const ref = matchSnapshotBaseline(chapter, baseline);
    expect(ref).not.toBeNull();
    const after = fromRevisionReviewState(withBaselineRef(legacy, ref as NonNullable<typeof ref>), chapter);
    expect(after?.label).toBe(before?.label);
    expect(after?.text).toBe(before?.text);
    expect(after?.decisions).toEqual(before?.decisions);
    expect(after?.baseline).toEqual({ source: 'snapshot', id: 'snap_d' });
    // 逐处决定合并出的结果文本一致
    expect(mergeRevisionDecisions(hunks, after?.decisions ?? {})).toBe(
      mergeRevisionDecisions(hunks, before?.decisions ?? {}),
    );
  });

  it('体积判据：引用格式字段体积与基线长度无关，全文格式随基线线性增长', () => {
    const small = '字'.repeat(100);
    const large = '字'.repeat(100_000);
    const oldSmall = JSON.stringify({ label: '快照 12:00', baseline: small, decisions: { h0: 'accept' } }).length;
    const oldLarge = JSON.stringify({ label: '快照 12:00', baseline: large, decisions: { h0: 'accept' } }).length;
    // 全文格式：基线每多一个字符，字段就多约一个字节（线性增长）
    expect(oldLarge - oldSmall).toBe(large.length - small.length);

    const referenced = toRevisionReviewState('快照 12:00', { source: 'snapshot', id: 'snap_a' }, { h0: 'accept' });
    const newSmall = JSON.stringify(referenced).length;
    const newLarge = JSON.stringify(toRevisionReviewState('快照 12:00', { source: 'revision', id: 'rev_1' }, { h0: 'accept' })).length;
    // 引用格式：字段体积与基线长度无关（只随来源字面量与 id 长度差几个字节）
    expect(Math.abs(newLarge - newSmall)).toBeLessThanOrEqual(2);
    expect(newSmall).toBeLessThan(200);
    // 省下的就是整份正文副本（差额 = 正文字节数 - 引用字段的固定开销）
    expect(oldLarge - newSmall).toBeGreaterThan(large.length - 200);
    expect(oldLarge / newSmall).toBeGreaterThan(500);
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
    const state = toRevisionReviewState('快照', { source: 'snapshot', id: 'snap_1' }, Object.fromEntries(decisions));
    const chapter = {
      snapshots: [{ id: 'snap_1', content: baseline, timestamp: 1, charCount: baseline.length, source: 'manual' as const }],
    };
    const restored = fromRevisionReviewState(state, chapter);
    expect(restored?.text).toBe(baseline);
    expect(mergeRevisionDecisions(hunks, restored?.decisions ?? {})).toBe(baseline);
  });
});
