/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 画布元素的 Y.Doc 存储：往返、收敛、墓碑与清除的行为测试。 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { type ElementState,resolveElement } from '@/features/collaboration/elementConvergence';
import type { CanvasLayout, CanvasNode, CanvasPoint } from '@/features/views/types';

import {
  applyCanvasLayoutToDoc,
  docCanvasStateLog,
  docCanvasStates,
  docToCanvasLayout,
  purgeCanvasTombstones,
  sameCanvasLayout,
} from '../canvasDoc';

const VIEW_ID = 'view:p1:canvas';

function makeLayout(): CanvasLayout {
  return {
    positions: {
      'row:c1': { x: 10, y: 20 },
      'row:c2': { x: 30, y: 40, width: 200, height: 120 },
    },
    nodes: [
      { id: 'note-1', type: 'text', x: 100, y: 100, width: 180, height: 96, text: '便签一', kind: 'character' },
      { id: 'link-1', type: 'link', x: 300, y: 100, width: 180, height: 96, url: 'https://example.com/docs' },
    ],
    edges: [{ id: 'edge:row:c1->row:c2', fromNode: 'row:c1', toNode: 'row:c2' }],
  };
}

function apply(doc: Y.Doc, layout: CanvasLayout): void {
  applyCanvasLayoutToDoc(doc, VIEW_ID, layout);
}

function log(doc: Y.Doc): ElementState[] {
  return docCanvasStateLog(doc, VIEW_ID);
}

function states(doc: Y.Doc): ElementState[] {
  return docCanvasStates(doc, VIEW_ID);
}

function byId(entries: ElementState[]): Map<string, ElementState> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function layoutOf(doc: Y.Doc): CanvasLayout | undefined {
  return docToCanvasLayout(doc, VIEW_ID);
}

/** 两份文档互相交换全量状态，模拟重连后的同步轮次。 */
function exchange(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
}

function withPosition(id: string, point: CanvasPoint): CanvasLayout {
  const base = makeLayout();
  return { ...base, positions: { ...base.positions, [id]: point } };
}

function withoutFreeNode(id: string): CanvasLayout {
  const base = makeLayout();
  return { ...base, nodes: base.nodes?.filter((node) => node.id !== id) };
}

function withFreeNode(node: CanvasNode): CanvasLayout {
  const base = makeLayout();
  return { ...base, nodes: [...(base.nodes ?? []), node] };
}

function nodeLayout(ids: string[]): CanvasLayout {
  return {
    nodes: ids.map((id, index) => ({ id, type: 'text', x: index * 10, y: 0, width: 180, height: 96, text: id })),
  };
}

describe('canvasDoc', () => {
  it('画布布局写入文档后原样读回（行坐标、自由节点、连线）', () => {
    const layout = makeLayout();
    const doc = new Y.Doc();
    apply(doc, layout);
    expect(layoutOf(doc)).toEqual(layout);
    // 行坐标 2 条 + 自由节点 2 条 + 连线 1 条。
    expect(log(doc)).toHaveLength(5);
    expect(states(doc).map((state) => state.version)).toEqual([1, 1, 1, 1, 1]);
  });

  it('重复应用同一布局不产生新状态（保存视图的推送幂等）', () => {
    const doc = new Y.Doc();
    apply(doc, makeLayout());
    apply(doc, makeLayout());
    expect(log(doc)).toHaveLength(5);
  });

  it('读回布局再次写回不产生新状态（拉取后回推送不震荡）', () => {
    const doc = new Y.Doc();
    apply(doc, makeLayout());
    const pulled = layoutOf(doc);
    expect(pulled).toEqual(makeLayout());
    apply(doc, pulled as CanvasLayout);
    expect(log(doc)).toHaveLength(5);
  });

  it('本地修改元素版本递增，删除元素写入墓碑且不参与投影', () => {
    const doc = new Y.Doc();
    apply(doc, makeLayout());
    const moved = withPosition('row:c1', { x: 10, y: 60 });
    apply(doc, moved);
    // 连续操作基于上一次的布局：删除自由节点 link-1，其余保持移动后的坐标。
    apply(doc, { ...moved, nodes: moved.nodes?.filter((node) => node.id !== 'link-1') });

    const merged = byId(states(doc));
    // 改动元素升到版本 2，数据为新值。
    expect(merged.get('row:c1')?.version).toBe(2);
    expect(merged.get('row:c1')?.data).toEqual({ x: 10, y: 60 });
    // 删除元素留下墓碑：版本 2、标记 deleted，条目仍在日志中。
    expect(merged.get('link-1')?.version).toBe(2);
    expect(merged.get('link-1')?.deleted).toBe(true);
    expect(log(doc).filter((state) => state.id === 'link-1')).toHaveLength(2);
    // 未改动元素不升版。
    expect(merged.get('row:c2')?.version).toBe(1);
    expect(merged.get('edge:row:c1->row:c2')?.version).toBe(1);
    // 墓碑不参与投影。
    expect(layoutOf(doc)?.nodes?.map((node) => node.id)).toEqual(['note-1']);
  });

  it('删除后本地重新新增同一 id：版本更高的新内容胜墓碑', () => {
    const doc = new Y.Doc();
    apply(doc, makeLayout());
    apply(doc, { ...makeLayout(), nodes: makeLayout().nodes?.filter((node) => node.id !== 'link-1') });
    expect(byId(states(doc)).get('link-1')?.deleted).toBe(true);

    // 用户重新加回同一 id 的节点：契约规定版本更高的非墓碑状态胜出。
    apply(doc, makeLayout());

    expect(byId(states(doc)).get('link-1')?.deleted).toBe(false);
    expect(byId(states(doc)).get('link-1')?.version).toBe(3);
    expect(layoutOf(doc)?.nodes?.map((node) => node.id)).toEqual(['note-1', 'link-1']);
  });

  it('对端旧状态到达不复活已删元素（墓碑版本更高）', () => {
    const docA = new Y.Doc();
    apply(docA, makeLayout());
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // B 删除 link-1 后 A 才收到：A 的旧状态（v1 未删）与墓碑同在日志中。
    apply(docB, withoutFreeNode('link-1'));
    exchange(docA, docB);

    expect(byId(states(docA)).get('link-1')?.deleted).toBe(true);
    expect(byId(states(docB)).get('link-1')?.deleted).toBe(true);
    expect(layoutOf(docA)).toEqual(layoutOf(docB));
    expect(layoutOf(docA)?.nodes?.map((node) => node.id)).toEqual(['note-1']);
  });

  it('断线重连后墓碑元素被文档清除', () => {
    const docA = new Y.Doc();
    apply(docA, makeLayout());
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    apply(docB, withoutFreeNode('link-1'));
    exchange(docA, docB);

    purgeCanvasTombstones(docA);
    purgeCanvasTombstones(docB);

    // 已删元素的全部条目（含墓碑）从文档移除。
    expect(log(docA).some((state) => state.id === 'link-1')).toBe(false);
    expect(log(docB).some((state) => state.id === 'link-1')).toBe(false);
    expect(layoutOf(docA)).toEqual(layoutOf(docB));
    expect(layoutOf(docA)?.nodes?.map((node) => node.id)).toEqual(['note-1']);
  });

  it('清除操作同时压缩被取代的状态条目，只留胜者', () => {
    const doc = new Y.Doc();
    apply(doc, makeLayout());
    apply(doc, withPosition('row:c1', { x: 10, y: 80 }));
    expect(log(doc).filter((state) => state.id === 'row:c1')).toHaveLength(2);

    purgeCanvasTombstones(doc);

    expect(log(doc).filter((state) => state.id === 'row:c1')).toHaveLength(1);
    expect(byId(states(doc)).get('row:c1')?.version).toBe(2);
    expect(layoutOf(doc)).toEqual(withPosition('row:c1', { x: 10, y: 80 }));
  });

  it('两端并发改同一元素：同版本按 clientId 决胜，合并结果与契约一致', () => {
    const docA = new Y.Doc();
    apply(docA, makeLayout());
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // 并发：两端各自移动同一行节点，版本都从 1 升到 2。
    apply(docA, withPosition('row:c1', { x: 10, y: 100 }));
    apply(docB, withPosition('row:c1', { x: 10, y: 200 }));
    const fromA = log(docA).find((state) => state.version === 2 && state.id === 'row:c1');
    const fromB = log(docB).find((state) => state.version === 2 && state.id === 'row:c1');
    expect(fromA).toBeDefined();
    expect(fromB).toBeDefined();
    const expected = resolveElement(fromA as ElementState, fromB as ElementState);

    exchange(docA, docB);

    expect(byId(states(docA)).get('row:c1')).toEqual(expected);
    expect(byId(states(docB)).get('row:c1')).toEqual(expected);
    expect(layoutOf(docA)).toEqual(layoutOf(docB));
    // 决胜规则：同版本同墓碑状态时 clientId 字典序大者胜。
    const winnerClientId = [fromA?.clientId ?? '', fromB?.clientId ?? ''].sort().at(-1);
    expect(expected.clientId).toBe(winnerClientId);
  });

  it('两端并发一删一改同一元素：墓碑胜', () => {
    const docA = new Y.Doc();
    apply(docA, makeLayout());
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    apply(docA, withoutFreeNode('link-1'));
    apply(docB, withFreeNode({ id: 'link-1', type: 'link', x: 400, y: 100, width: 180, height: 96, url: 'https://example.com/other' }));
    exchange(docA, docB);

    expect(byId(states(docA)).get('link-1')?.deleted).toBe(true);
    expect(byId(states(docB)).get('link-1')?.deleted).toBe(true);
    expect(layoutOf(docA)?.nodes?.map((node) => node.id)).toEqual(['note-1']);
  });

  it('离线端多次修改：版本更高者胜，与 clientId 无关', () => {
    const docA = new Y.Doc();
    apply(docA, makeLayout());
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // A 离线连改两次（版本 2、3），B 并发改一次（版本 2）。
    apply(docA, withPosition('row:c1', { x: 10, y: 80 }));
    apply(docA, withPosition('row:c1', { x: 10, y: 90 }));
    apply(docB, withPosition('row:c1', { x: 10, y: 200 }));
    exchange(docA, docB);

    const winner = byId(states(docA)).get('row:c1');
    expect(winner?.version).toBe(3);
    expect(winner?.data).toEqual({ x: 10, y: 90 });
    expect(byId(states(docB)).get('row:c1')).toEqual(winner);
    expect(layoutOf(docA)?.positions?.['row:c1']).toEqual({ x: 10, y: 90 });
  });

  it('自由节点顺序两端收敛一致（分数降序，同分按 id）', () => {
    const docA = new Y.Doc();
    apply(docA, nodeLayout(['n1', 'n2', 'n3']));
    const docB = new Y.Doc();
    apply(docB, nodeLayout(['n3', 'n1', 'n2']));
    exchange(docA, docB);

    const orderA = layoutOf(docA)?.nodes?.map((node) => node.id) ?? [];
    const orderB = layoutOf(docB)?.nodes?.map((node) => node.id) ?? [];
    expect(orderA).toEqual(orderB);
    // 收敛结果必为其中一端的播种顺序（clientId 决胜选定一份分数）。
    expect([['n1', 'n2', 'n3'], ['n3', 'n1', 'n2']]).toContainEqual(orderA);
  });

  it('文档无状态的视图读回空；布局比对忽略键序', () => {
    const doc = new Y.Doc();
    expect(layoutOf(doc)).toBeUndefined();
    expect(states(doc)).toEqual([]);
    expect(sameCanvasLayout(undefined, undefined)).toBe(true);
    expect(sameCanvasLayout({ positions: { a: { x: 1, y: 2, width: 3 } } }, { positions: { a: { width: 3, x: 1, y: 2 } } })).toBe(true);
    expect(sameCanvasLayout({ positions: { a: { x: 1, y: 2 } } }, undefined)).toBe(false);
  });
});
