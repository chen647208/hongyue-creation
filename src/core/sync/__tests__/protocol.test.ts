/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { AttributeEntity, EdgeEntity,NodeEntity } from '../../entities';
import type { EntitySnapshot } from '../protocol.js';
import { buildBundle, canonicalHash, localState, mergeBundle } from '../protocol.js';

const node = (id: string, title: string, body: string): NodeEntity =>
  ({ id, bookId: 'b1', type: 'novel.chapter', title, body, createdAt: 0, updatedAt: 0, erased: false });

const attr = (id: string, nodeId: string, value: string): AttributeEntity =>
  ({ id, nodeId, type: 'label', name: 'status', value, inheritable: false, position: 0, erased: false });

const snap = (nodes: NodeEntity[], attrs: AttributeEntity[] = [], edges: EdgeEntity[] = []): EntitySnapshot =>
  ({ nodes, attrs, edges });

describe('canonicalHash', () => {
  it('键序无关、内容敏感', () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }));
  });
});

describe('mergeBundle（LWW 禁用 → 冲突副本）', () => {
  it('本地缺失 → 直接插入远端实体与属性', () => {
    const remote = snap([node('n1', '新章', '远端新增')], [attr('a1', 'n1', 'draft')]);
    const bundle = buildBundle({ bookId: 'b1', instanceId: 'dev-b', changes: [{ changeId: 1, entityName: 'nodes', entityId: 'n1', hash: canonicalHash(remote.nodes[0]!), isErased: false, agentId: 'user', utcDateChanged: 1 }], entities: remote });
    const report = mergeBundle(bundle, localState(snap([])));
    expect(report.applied).toHaveLength(1);
    expect(report.insertNodes[0]!.title).toBe('新章');
    expect(report.insertAttrs).toHaveLength(1);
  });

  it('内容一致 → 跳过', () => {
    const n = node('n1', '同章', '同一内容');
    const remote = snap([n]);
    const bundle = buildBundle({ bookId: 'b1', instanceId: 'dev-b', changes: [{ changeId: 1, entityName: 'nodes', entityId: 'n1', hash: canonicalHash(n), isErased: false, agentId: 'user', utcDateChanged: 1 }], entities: remote });
    const report = mergeBundle(bundle, localState(snap([n])));
    expect(report.skipped[0]).toContain('已同步');
    expect(report.applied).toHaveLength(0);
  });

  it('双方都改 → 冲突副本：本地保留、远端以新 id 落库且属性随迁', () => {
    const remoteVersion = node('n1', '第一章', '远端改写的正文');
    const localVersion = node('n1', '第一章', '本地改写的正文');
    const remote = snap([remoteVersion], [attr('a1', 'n1', 'remote-status')]);
    const bundle = buildBundle({ bookId: 'b1', instanceId: 'dev-b', changes: [{ changeId: 1, entityName: 'nodes', entityId: 'n1', hash: canonicalHash(remoteVersion), isErased: false, agentId: 'user', utcDateChanged: 2 }], entities: remote });

    const local = localState(snap([localVersion], [attr('a1', 'n1', 'local-status')]));
    const report = mergeBundle(bundle, local);

    expect(report.conflictCopies).toHaveLength(1);
    const copy = report.conflictCopies[0]!;
    expect(copy.node.id).not.toBe('n1');
    expect(copy.node.title).toContain('冲突副本');
    expect(copy.node.body).toBe('远端改写的正文');
    expect(copy.attrs[0]!.nodeId).toBe(copy.node.id);
    // 本地原文不在插入集中（保留不动）
    expect(report.insertNodes.find((n) => n.id === 'n1')).toBeUndefined();
  });

  it('远端墓碑：报告提示软删，不自动插入', () => {
    const local = localState(snap([node('n1', '旧章', '正文')]));
    const bundle = buildBundle({ bookId: 'b1', instanceId: 'dev-b', changes: [{ changeId: 1, entityName: 'nodes', entityId: 'n1', hash: '', isErased: true, agentId: 'user', utcDateChanged: 3 }], entities: snap([]) });
    const report = mergeBundle(bundle, local);
    expect(report.applied).toHaveLength(0);
    expect(report.skipped[0]).toContain('墓碑');
  });

  it('既有节点新增属性：节点内容未变也补插远端属性', () => {
    const n = node('n1', '同章', '同一内容');
    const remoteAttr = attr('a1', 'n1', '远端新增');
    const remote = snap([n], [remoteAttr]);
    const bundle = buildBundle({
      bookId: 'b1',
      instanceId: 'dev-b',
      changes: [
        { changeId: 1, entityName: 'nodes', entityId: 'n1', hash: canonicalHash(n), isErased: false, agentId: 'user', utcDateChanged: 1 },
        { changeId: 2, entityName: 'attrs', entityId: 'a1', hash: canonicalHash(remoteAttr), isErased: false, agentId: 'user', utcDateChanged: 1 },
      ],
      entities: remote,
    });

    const report = mergeBundle(bundle, localState(snap([n])));

    expect(report.appliedAttrs.map((a) => a.id)).toEqual(['a1']);
    expect(report.insertAttrs.map((a) => a.id)).toEqual(['a1']);
    expect(report.applied).toHaveLength(0);
  });

  it('节点冲突时属性随副本迁移，不再补插到本地原节点', () => {
    const remoteVersion = node('n1', '第一章', '远端改写的正文');
    const localVersion = node('n1', '第一章', '本地改写的正文');
    const remote = snap([remoteVersion], [attr('a1', 'n1', 'remote-status')]);
    const bundle = buildBundle({ bookId: 'b1', instanceId: 'dev-b', changes: [{ changeId: 1, entityName: 'nodes', entityId: 'n1', hash: canonicalHash(remoteVersion), isErased: false, agentId: 'user', utcDateChanged: 2 }], entities: remote });
    const local = localState(snap([localVersion], [attr('a1', 'n1', 'local-status')]));

    const report = mergeBundle(bundle, local);

    expect(report.appliedAttrs).toHaveLength(0);
    expect(report.insertAttrs).toHaveLength(1);
    expect(report.insertAttrs[0]!.nodeId).toBe(report.conflictCopies[0]!.node.id);
  });

  it('attrs 冲突：报告人工处理，不覆盖', () => {
    const remote = snap([], [attr('a1', 'n1', 'remote')]);
    const bundle = buildBundle({ bookId: 'b1', instanceId: 'dev-b', changes: [{ changeId: 1, entityName: 'attrs', entityId: 'a1', hash: canonicalHash(remote.attrs[0]!), isErased: false, agentId: 'user', utcDateChanged: 1 }], entities: remote });
    const local = localState(snap([node('n1', 't', 'b')], [attr('a1', 'n1', 'local')]));
    const report = mergeBundle(bundle, local);
    expect(report.manual[0]!.reason).toContain('人工');
  });
});
