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
  type BranchScene,
  buildJumpTable,
  canReachEnding,
  collectConditionVariables,
  evalCondition,
  firstReadThrough,
  reachableScenes,
  validateBranching,
} from '../index.js';

function sample(): BranchScene[] {
  return [
    { id: 's1', title: '开场', choices: [{ text: '去A', target: 's2' }, { text: '去B', target: 's3' }] },
    { id: 's2', title: '支线A', choices: [{ text: '深入', target: 's4' }] },
    { id: 's3', title: '支线B', choices: [{ text: '深入', target: 's5' }] },
    { id: 's4', title: '汇合', choices: [{ text: '结局一', target: 'end1' }] },
    { id: 's5', title: '分歧', choices: [{ text: '结局二', target: 'end2' }, { text: '隐藏结局', target: 'end1', condition: 'flag > 0' }] },
    { id: 'end1', title: '结局一', ending: true },
    { id: 'end2', title: '结局二', ending: true },
  ];
}

describe('条件求值（受限子集）', () => {
  it('比较、与或非与括号', () => {
    expect(evalCondition('flag > 0', { flag: 1 })).toBe(true);
    expect(evalCondition('flag > 0', { flag: 0 })).toBe(false);
    expect(evalCondition('flag == 2 && trust >= 1', { flag: 2, trust: 1 })).toBe(true);
    expect(evalCondition('flag == 2 || trust > 3', { flag: 1, trust: 4 })).toBe(true);
    expect(evalCondition('!(flag == 2)', { flag: 1 })).toBe(true);
    expect(evalCondition('flag > 0 && (trust > 1 || flag == 1)', { flag: 1, trust: 0 })).toBe(true);
  });

  it('缺省条件恒真；未定义变量抛错', () => {
    expect(evalCondition(undefined, {})).toBe(true);
    expect(evalCondition('', {})).toBe(true);
    expect(() => evalCondition('missing > 0', {})).toThrow(/未定义变量/);
  });

  it('抽取表达式变量', () => {
    expect(collectConditionVariables('flag > 0 && trust <= 2 || flag == 1')).toEqual(['flag', 'trust']);
    expect(collectConditionVariables(undefined)).toEqual([]);
  });
});

describe('跳转表与可达性', () => {
  it('跳转表逐条列出选择项', () => {
    const table = buildJumpTable(sample());
    expect(table).toHaveLength(7);
    expect(table[0]).toMatchObject({ fromId: 's1', choice: '去A', target: 's2' });
    expect(table.find((entry) => entry.condition)).toMatchObject({ target: 'end1', condition: 'flag > 0' });
  });

  it('可达场景覆盖两条支线；孤儿不可达', () => {
    const scenes = [...sample(), { id: 'orphan', title: '孤儿' }];
    const reachable = reachableScenes(scenes, 's1');
    expect(reachable.has('s1')).toBe(true);
    expect(reachable.has('end1')).toBe(true);
    expect(reachable.has('orphan')).toBe(false);
  });

  it('可达结局反向计算', () => {
    const canReach = canReachEnding(sample());
    expect(canReach.has('s1')).toBe(true);
    expect(canReach.has('s5')).toBe(true);
  });
});

describe('完整性校验', () => {
  it('报出孤儿、未定义变量与不可达结局', () => {
    const scenes: BranchScene[] = [
      ...sample(),
      { id: 'orphan', title: '孤儿' },
      { id: 'end3', title: '不可达结局', ending: true },
    ];
    scenes[4]!.choices!.push({ text: '坏条件', target: 'end2', condition: 'missing > 0' });
    const issues = validateBranching(scenes, [{ name: 'flag' }], 's1');
    const kinds = issues.map((issue) => issue.kind);
    expect(kinds).toContain('orphan');
    expect(kinds).toContain('undefinedVariable');
    expect(kinds).toContain('unreachableEnding');
    expect(issues.find((issue) => issue.kind === 'orphan')?.sceneId).toBe('orphan');
  });

  it('非结局无出口与悬空目标单独报出', () => {
    const scenes: BranchScene[] = [
      { id: 'a', title: 'A', choices: [{ text: '去', target: 'ghost' }] },
      { id: 'b', title: 'B' },
    ];
    const issues = validateBranching(scenes, [], 'a');
    expect(issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining(['danglingTarget', 'noExit']));
  });

  it('循环无出口报出', () => {
    const scenes: BranchScene[] = [
      { id: 'a', title: 'A', choices: [{ text: '到B', target: 'b' }] },
      { id: 'b', title: 'B', choices: [{ text: '回A', target: 'a' }] },
    ];
    expect(validateBranching(scenes, [], 'a').some((issue) => issue.kind === 'cycle')).toBe(true);
  });
});

describe('按分支顺序阅读', () => {
  it('沿第一个可用选择走到结局', () => {
    expect(firstReadThrough(sample(), { flag: 0 })).toEqual(['s1', 's2', 's4', 'end1']);
  });

  it('条件不满足时跳过隐藏选项', () => {
    const scenes: BranchScene[] = [
      { id: 'a', title: 'A', choices: [{ text: '隐藏', target: 'end', condition: 'flag > 0' }, { text: '普通', target: 'end' }] },
      { id: 'end', title: '结局', ending: true },
    ];
    expect(firstReadThrough(scenes, { flag: 0 })).toEqual(['a', 'end']);
  });
});
