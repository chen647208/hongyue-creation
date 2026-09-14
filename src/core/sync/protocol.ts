/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 同步协议（docs/design/03 entity_changes 协议 + design/08 M4「LWW 禁用」）。
 *
 * bundle = 一台设备对一本书的变更记录 + 实体当前值快照（传输单元，JSON 可
 * 经网盘/手动拷贝交换）。合并规则：
 *  - 本地缺失 → 直接插入远端实体；
 *  - 本地内容与远端变更一致（canonical hash 相等）→ 跳过；
 *  - 双方都改（hash 不一致）→ **冲突副本**：保留本地，远端版本以新 id 插入
 *    （标题追加「冲突副本」标记），绝不覆盖——LWW 禁用的落地；
 *  - 远端墓碑（erased）且本地存在 → 本地软删（删除传播优先）；
 *  - attrs/edges 冲突无法独立成副本 → 报告人工处理，绝不覆盖；
 *  - 边本地缺失 → 按稳定键插入（重复导入幂等），关系不丢。
 *
 * canonicalHash：跨设备一致的实体内容指纹（稳定序列化 + FNV-1a），合并
 * 判定只信任它；entity_changes.hash（仓库内部哈希）随 bundle 留档审计。
 * 纯模块，无 IO。
 */
import type { AttributeEntity,EdgeEntity, NodeEntity } from '../entities';
import { uuidv7 } from '../entities/uuid';

export interface EntitySnapshot {
  nodes: NodeEntity[];
  edges: EdgeEntity[];
  attrs: AttributeEntity[];
}

export interface SyncChange {
  changeId: number;
  entityName: 'nodes' | 'edges' | 'attrs';
  entityId: string;
  hash: string;
  isErased: boolean;
  agentId: string;
  utcDateChanged: number;
}

export interface SyncBundle {
  version: 1;
  bookId: string;
  /** 生成端设备实例 id */
  instanceId: string;
  generatedAt: number;
  changes: SyncChange[];
  /** 变更涉及实体的当前值快照 */
  entities: EntitySnapshot;
}

export interface LocalEntityState {
  /** 本地实体当前值（含未变更项） */
  entities: EntitySnapshot;
  /** 本地实体当前 canonical hash（id → hash） */
  hashByEntityId: Map<string, string>;
}

export interface ConflictCopy {
  /** 冲突对应的本地实体 id（本地保留不变，远端版本据此映射回原实体）。 */
  sourceId: string;
  /** 远端实体以新 id 落为副本 */
  node: NodeEntity;
  attrs: AttributeEntity[];
}

export interface MergeReport {
  applied: NodeEntity[];
  conflictCopies: ConflictCopy[];
  skipped: string[];
  /** 既有节点上补插的新增属性（本地缺失、远端新增）。 */
  appliedAttrs: AttributeEntity[];
  /** attrs/edges 冲突：无法自动合并，需人工处理 */
  manual: Array<{ entityName: string; entityId: string; reason: string }>;
}

/** 稳定序列化：键排序后拼接。 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** FNV-1a 32 位内容指纹（跨设备一致，不做密码学用途）。 */
export function canonicalHash(entity: unknown): string {
  const text = stableStringify(entity);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * 边的稳定去重键：from/to/kind/role 决定关系身份，跨设备同一条边映射到同一键。
 * 与投影桥 `core/project/bridge.ts` 的确定性边 id 同构，故同时可作 id 兜底。
 */
export function edgeStableKey(edge: Pick<EdgeEntity, 'fromId' | 'toId' | 'kind' | 'role'>): string {
  return `e:${edge.fromId}>${edge.toId}:${edge.kind}:${edge.role ?? ''}`;
}

/** 从本地实体集构造合并输入（canonical hash 全量计算）。 */
export function localState(entities: EntitySnapshot): LocalEntityState {
  const hashByEntityId = new Map<string, string>();
  for (const n of entities.nodes) hashByEntityId.set(n.id, canonicalHash(n));
  for (const e of entities.edges) hashByEntityId.set(e.id, canonicalHash(e));
  for (const a of entities.attrs) hashByEntityId.set(a.id, canonicalHash(a));
  return { entities, hashByEntityId };
}

/** 构建同步包：只携带发生变化的实体（hash 集合差异由调用方筛）。 */
export function buildBundle(input: { bookId: string; instanceId: string; changes: SyncChange[]; entities: EntitySnapshot }): SyncBundle {
  return { version: 1, bookId: input.bookId, instanceId: input.instanceId, generatedAt: Date.now(), changes: input.changes, entities: input.entities };
}

function conflictedNodeCopy(node: NodeEntity, allAttrs: AttributeEntity[]): { sourceId: string; node: NodeEntity; attrs: AttributeEntity[] } {
  const copyId = `conflict-${node.id}-${uuidv7()}`;
  const copy: NodeEntity = {
    ...node,
    id: copyId,
    title: `${node.title}（冲突副本）`,
    body: node.body,
    updatedAt: Date.now(),
  };
  const attrs = allAttrs
    .filter((a) => a.nodeId === node.id && !a.erased)
    .map((a) => ({ ...a, id: `conflict-${a.id}-${uuidv7()}`, nodeId: copyId }));
  return { sourceId: node.id, node: copy, attrs };
}

/**
 * 合并远端 bundle 到本地。返回报告 + 建议写入本地的实体集
 * （applied 节点 + 冲突副本 + 缺失的边；attrs/edges 冲突由调用方按报告人工处理）。
 */
export function mergeBundle(bundle: SyncBundle, local: LocalEntityState): MergeReport & { insertNodes: NodeEntity[]; insertAttrs: AttributeEntity[]; insertEdges: EdgeEntity[] } {
  const localNodes = new Map(local.entities.nodes.map((n) => [n.id, n]));
  const localAttrsByNode = new Map<string, AttributeEntity[]>();
  for (const a of local.entities.attrs) {
    if (a.erased) continue;
    const list = localAttrsByNode.get(a.nodeId) ?? [];
    list.push(a);
    localAttrsByNode.set(a.nodeId, list);
  }

  const report: MergeReport = { applied: [], conflictCopies: [], skipped: [], appliedAttrs: [], manual: [] };
  const insertNodes: NodeEntity[] = [];
  const insertAttrs: AttributeEntity[] = [];
  const insertEdges: EdgeEntity[] = [];

  const remoteNodeChanges = new Map<string, SyncChange>();
  const erasedNodeIds = new Set<string>();
  for (const change of bundle.changes) {
    if (change.entityName === 'nodes') {
      remoteNodeChanges.set(change.entityId, change);
      if (change.isErased) erasedNodeIds.add(change.entityId);
    }
  }

  const remoteNodeById = new Map(bundle.entities.nodes.map((n) => [n.id, n]));
  const remoteAttrsByNode = new Map<string, AttributeEntity[]>();
  for (const a of bundle.entities.attrs) remoteAttrsByNode.set(a.nodeId, [...(remoteAttrsByNode.get(a.nodeId) ?? []), a]);

  for (const [entityId, change] of remoteNodeChanges) {
    const remoteNode = remoteNodeById.get(entityId);
    const localNode = localNodes.get(entityId);

    if (change.isErased) {
      if (localNode) report.skipped.push(`${entityId}: 墓碑——本地应软删（由仓库执行）`);
      else report.skipped.push(`${entityId}: 墓碑且本地不存在`);
      continue;
    }
    if (!remoteNode) continue;

    if (!localNode) {
      // 本地缺失：直接插入远端实体及其属性
      insertNodes.push(remoteNode);
      for (const a of remoteAttrsByNode.get(entityId) ?? []) insertAttrs.push(a);
      report.applied.push(remoteNode);
      continue;
    }

    const localHash = local.hashByEntityId.get(entityId) ?? '';
    const localContentHash = canonicalHash(localNode);
    if (localHash === change.hash || localContentHash === canonicalHash(remoteNode)) {
      report.skipped.push(`${entityId}: 已同步`);
      continue;
    }

    // 双方都改 → 冲突副本（本地保留，远端以新 id 落库）
    const copy = conflictedNodeCopy(remoteNode, [...(remoteAttrsByNode.get(entityId) ?? [])]);
    insertNodes.push(copy.node);
    insertAttrs.push(...copy.attrs);
    report.conflictCopies.push({ sourceId: copy.sourceId, node: copy.node, attrs: copy.attrs });
  }

  // 既有节点的新增属性补插：本地已有该节点、远端属性本地缺失 → 插入（节点未改也要迁属性）。
  const localAttrIds = new Set(local.entities.attrs.map((a) => a.id));
  const localNodeIds = new Set(local.entities.nodes.filter((n) => !n.erased).map((n) => n.id));
  const insertedNodeIds = new Set(insertNodes.map((n) => n.id));
  const conflictSourceIds = new Set(report.conflictCopies.map((c) => c.sourceId));
  const scheduledAttrIds = new Set(insertAttrs.map((a) => a.id));
  for (const remoteAttr of bundle.entities.attrs) {
    if (remoteAttr.erased) continue;
    if (localAttrIds.has(remoteAttr.id) || scheduledAttrIds.has(remoteAttr.id)) continue;
    // 冲突节点的远端属性已作为副本随迁，不再补插到本地原节点上
    if (conflictSourceIds.has(remoteAttr.nodeId) || erasedNodeIds.has(remoteAttr.nodeId)) continue;
    if (!localNodeIds.has(remoteAttr.nodeId) && !insertedNodeIds.has(remoteAttr.nodeId)) continue;
    insertAttrs.push(remoteAttr);
    scheduledAttrIds.add(remoteAttr.id);
    report.appliedAttrs.push(remoteAttr);
  }

  // attrs 冲突：无法独立成副本，报告人工
  for (const change of bundle.changes) {
    if (change.entityName === 'attrs') {
      const localHash = local.hashByEntityId.get(change.entityId);
      if (localHash && localHash !== change.hash) {
        report.manual.push({ entityName: 'attrs', entityId: change.entityId, reason: '属性双方都改：人工比对（不自动覆盖）' });
      }
    }
  }

  // edges：本地缺失 → 插入；稳定键已存在 → 跳过（重复导入幂等）；双方都改 → 人工
  const localEdgeById = new Map(local.entities.edges.map((e) => [e.id, e]));
  const localEdgeKeys = new Set(
    local.entities.edges.filter((e) => !e.erased).map((e) => edgeStableKey(e))
  );
  const remoteEdgeById = new Map(bundle.entities.edges.map((e) => [e.id, e]));
  for (const change of bundle.changes) {
    if (change.entityName !== 'edges') continue;
    if (change.isErased) {
      report.skipped.push(
        localEdgeById.has(change.entityId)
          ? `${change.entityId}: 边墓碑——本地应软删（由仓库执行）`
          : `${change.entityId}: 边墓碑且本地不存在`
      );
      continue;
    }
    const remoteEdge = remoteEdgeById.get(change.entityId);
    if (!remoteEdge) continue;
    const localEdge = localEdgeById.get(change.entityId);
    if (!localEdge) {
      if (localEdgeKeys.has(edgeStableKey(remoteEdge))) {
        report.skipped.push(`${change.entityId}: 边已存在（稳定键重复）`);
        continue;
      }
      insertEdges.push(remoteEdge);
      continue;
    }
    const localHash = local.hashByEntityId.get(change.entityId) ?? '';
    if (localHash === change.hash || canonicalHash(localEdge) === canonicalHash(remoteEdge)) {
      report.skipped.push(`${change.entityId}: 已同步`);
      continue;
    }
    report.manual.push({ entityName: 'edges', entityId: change.entityId, reason: '边双方都改：人工比对（不自动覆盖）' });
  }

  return { ...report, insertNodes, insertAttrs, insertEdges };
}
