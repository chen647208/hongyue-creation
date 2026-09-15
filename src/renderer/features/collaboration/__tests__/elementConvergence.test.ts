/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 协作收敛不变量：版本号 + 随机决胜 + 墓碑 + 分数排序。
 *
 * 运行时不变量由 Yjs 的 CRDT 合并提供（见 projectDoc.test.ts 的双副本收敛用例）；
 * 本文件对元素级收敛契约做纯函数验证，覆盖交换律、结合律、幂等与墓碑语义。
 */
import { describe, expect, it } from 'vitest';

import { type ElementState, mergeElementStates, orderVisibleElements, resolveElement } from '../elementConvergence';

function element(overrides: Partial<ElementState> & Pick<ElementState, 'id'>): ElementState {
  return { version: 1, score: 0, deleted: false, updatedAt: 1, clientId: 'a', ...overrides };
}

function byId(states: readonly ElementState[]): Record<string, ElementState> {
  return Object.fromEntries(states.map((state) => [state.id, state]));
}

describe('元素收敛：版本号', () => {
  it('版本高者胜，与到达顺序无关', () => {
    const older = element({ id: 'e1', version: 1, clientId: 'z', data: { v: 1 } });
    const newer = element({ id: 'e1', version: 2, clientId: 'a', data: { v: 2 } });
    expect(resolveElement(older, newer)).toBe(newer);
    expect(resolveElement(newer, older)).toBe(newer);
  });
});

describe('元素收敛：随机决胜', () => {
  it('同版本同墓碑状态时按 clientId 字典序确定胜负，双向一致', () => {
    const left = element({ id: 'e1', version: 3, clientId: 'peer-a' });
    const right = element({ id: 'e1', version: 3, clientId: 'peer-b' });
    expect(resolveElement(left, right)).toBe(right);
    expect(resolveElement(right, left)).toBe(right);
  });
});

describe('元素收敛：墓碑', () => {
  it('同版本下墓碑胜过更新', () => {
    const alive = element({ id: 'e1', version: 5, deleted: false });
    const tombstone = element({ id: 'e1', version: 5, deleted: true });
    expect(resolveElement(alive, tombstone)).toBe(tombstone);
    expect(resolveElement(tombstone, alive)).toBe(tombstone);
  });

  it('旧更新不能复活墓碑（版本优先）', () => {
    const tombstone = element({ id: 'e1', version: 6, deleted: true });
    const staleUpdate = element({ id: 'e1', version: 4, deleted: false });
    expect(resolveElement(tombstone, staleUpdate)).toBe(tombstone);
  });
});

describe('元素收敛：交换、结合、幂等', () => {
  const a = element({ id: 'e1', version: 2, clientId: 'a', score: 10 });
  const b = element({ id: 'e1', version: 2, clientId: 'b', score: 20 });
  const c = element({ id: 'e1', version: 3, clientId: 'c', deleted: true });

  it('交换律：不同合并顺序结果一致', () => {
    expect(resolveElement(resolveElement(a, b), c)).toBe(resolveElement(resolveElement(b, a), c));
  });

  it('结合律：分组顺序不影响结果', () => {
    const left = resolveElement(resolveElement(a, b), c);
    const right = resolveElement(a, resolveElement(b, c));
    expect(left).toBe(right);
  });

  it('幂等：重复合并同一条不改变结果', () => {
    expect(resolveElement(a, a)).toBe(a);
    expect(resolveElement(b, b)).toBe(b);
  });

  it('批量合并按 id 去重且可复算', () => {
    const merged = byId(mergeElementStates([
      element({ id: 'e1', version: 1 }),
      element({ id: 'e2', version: 1 }),
      element({ id: 'e1', version: 2, clientId: 'winner' }),
    ]));
    expect(Object.keys(merged)).toEqual(['e1', 'e2']);
    expect(merged.e1?.version).toBe(2);
    expect(merged.e1?.clientId).toBe('winner');
  });
});

describe('元素收敛：分数排序', () => {
  it('可见元素按分数降序、同分按 id 升序，墓碑被排除', () => {
    const ordered = orderVisibleElements([
      element({ id: 'b', score: 5 }),
      element({ id: 'a', score: 5 }),
      element({ id: 'c', score: 9 }),
      element({ id: 'd', score: 100, deleted: true }),
    ]);
    expect(ordered.map((state) => state.id)).toEqual(['c', 'a', 'b']);
  });

  it('排序与输入顺序无关（多端一致）', () => {
    const states = [element({ id: 'x', score: 1 }), element({ id: 'y', score: 2 }), element({ id: 'z', score: 2 })];
    const forward = orderVisibleElements(states).map((state) => state.id);
    const backward = orderVisibleElements([...states].reverse()).map((state) => state.id);
    expect(forward).toEqual(backward);
    expect(forward).toEqual(['y', 'z', 'x']);
  });
});
