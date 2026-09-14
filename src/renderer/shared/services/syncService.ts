/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 同步服务：把 core/sync 协议接到应用的 SQLite 存储。
 *
 * 导出：读全书实体 + 变更记录 → canonicalHash 合成 SyncChange → bundle JSON。
 * 导入：读 bundle → mergeBundle（LWW 禁用）→ 按用户选定的冲突策略应用插入集
 * 并返回报告供 UI 展示。冲突分类只有 mergeBundle 一套：本层只决定"怎么落地"，
 * 不重新判定谁是冲突。
 */
import type { AttributeEntity, EdgeEntity, NodeEntity } from '@core/entities';
import { getInstanceId, hashEntity } from '@core/entities';
import {
  buildBundle,
  canonicalHash,
  type EntitySnapshot,
  localState,
  mergeBundle,
  type MergeReport,
  type SyncBundle,
} from '@core/sync';
import type { FileDialogOptions, SaveDialogOptions, SyncTransportConfig } from '@shared/types';

import { getSyncObject, putSyncObject, type RetryOptions } from './syncTransportService';

function db(): NonNullable<Window['electronAPI']>['db'] {
  if (!window.electronAPI) throw new Error('同步需要桌面环境（文件系统/SQLite）');
  return window.electronAPI.db;
}

interface NodeRow { id: string; book_id: string; type: string; title: string; body: string; path: string | null; created_at: number; updated_at: number; erased: number }
interface AttrRow { id: string; node_id: string; type: 'label' | 'relation'; name: string; value: string; inheritable: number; position: number; erased: number }
interface EdgeRow { id: string; from_id: string; to_id: string; kind: string; role: string | null; position: number; book_id: string; erased: number }

function toNode(r: NodeRow): NodeEntity {
  return { id: r.id, bookId: r.book_id, type: r.type, title: r.title, body: r.body, path: r.path ?? undefined, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), erased: r.erased === 1 };
}
function toAttr(r: AttrRow): AttributeEntity {
  return { id: r.id, nodeId: r.node_id, type: r.type, name: r.name, value: r.value, inheritable: r.inheritable === 1, position: Number(r.position), erased: r.erased === 1 };
}
function toEdge(r: EdgeRow): EdgeEntity {
  return { id: r.id, fromId: r.from_id, toId: r.to_id, kind: r.kind as EdgeEntity['kind'], role: r.role ?? undefined, position: Number(r.position), bookId: r.book_id, erased: r.erased === 1 };
}

async function readEntities(bookId: string): Promise<EntitySnapshot> {
  const nodeRows = (await db().all('nodes.selectByBook', [bookId])) as unknown as NodeRow[];
  const attrRows = (await db().all('attrs.selectByBook', [bookId])) as unknown as AttrRow[];
  const edgeRows = (await db().all('edges.selectByBook', [bookId])) as unknown as EdgeRow[];
  return { nodes: nodeRows.map(toNode), attrs: attrRows.map(toAttr), edges: edgeRows.map(toEdge) };
}

export interface SyncBundleExport { path: string; changeCount: number }

/** 合成某本书的同步包（导出、上传与退出导出共用）。 */
export async function buildSyncBundle(bookId: string): Promise<{ bundle: SyncBundle; changeCount: number }> {
  const entities = await readEntities(bookId);
  let seq = 0;
  const changes = [
    ...entities.nodes.map((n) => ({ changeId: ++seq, entityName: 'nodes' as const, entityId: n.id, hash: canonicalOf(n), isErased: n.erased, agentId: 'sync', utcDateChanged: n.updatedAt })),
    ...entities.edges.map((e) => ({ changeId: ++seq, entityName: 'edges' as const, entityId: e.id, hash: canonicalOf(e), isErased: e.erased, agentId: 'sync', utcDateChanged: 0 })),
    ...entities.attrs.map((a) => ({ changeId: ++seq, entityName: 'attrs' as const, entityId: a.id, hash: canonicalOf(a), isErased: a.erased, agentId: 'sync', utcDateChanged: 0 })),
  ];
  const bundle = buildBundle({ bookId, instanceId: getInstanceId(), changes, entities });
  return { bundle, changeCount: changes.length };
}

/** 同步对象在传输后端上的公共前缀；多书共用一个传输目录。 */
export const SYNC_OBJECT_PREFIX = 'hongyue-sync/';

/** 同步对象在传输后端上的默认键。 */
export function syncObjectKey(bookId: string): string {
  return `${SYNC_OBJECT_PREFIX}${bookId}.json`;
}

/** 导出某本书的同步包（JSON），写入用户选择的路径。 */
export async function exportSyncBundle(bookId: string, bookTitle: string): Promise<SyncBundleExport> {
  const { bundle, changeCount } = await buildSyncBundle(bookId);

  const saveOptions: SaveDialogOptions = {
    title: '导出同步包',
    defaultPath: `${bookTitle || bookId}-sync-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'AI Novel Sync', extensions: ['json'] }],
  };
  const api = window.electronAPI;
  if (!api) throw new Error('同步需要桌面环境');
  const save = await api.saveFileDialog(saveOptions);
  if (save.canceled || !save.filePath) throw new Error('已取消导出');
  await api.writeFile(save.filePath, JSON.stringify(bundle, null, 2));
  return { path: save.filePath, changeCount };
}

export interface SyncUploadResult { key: string; changeCount: number }

/**
 * 导出并上传同步包到传输后端。失败按 retry 选项重试（默认 3 次）。
 */
export async function uploadSyncBundle(
  bookId: string,
  config: SyncTransportConfig,
  options: { key?: string } & RetryOptions = {},
): Promise<SyncUploadResult> {
  const { bundle, changeCount } = await buildSyncBundle(bookId);
  const key = options.key?.trim() || syncObjectKey(bookId);
  await putSyncObject(config, key, JSON.stringify(bundle, null, 2), options);
  return { key, changeCount };
}

function canonicalOf(entity: unknown): string {
  return canonicalHash(entity);
}

/** 合并冲突的落地策略：保留冲突副本 / 应用远端替换 / 标记失败待处理。 */
export type SyncConflictPolicy = 'keep-copy' | 'use-remote' | 'defer';

export interface SyncConflictItem {
  entityName: 'nodes' | 'attrs' | 'edges';
  entityId: string;
  /** 节点冲突时的远端副本标题；attrs/edges 无标题。 */
  title?: string;
  reason: string;
  /** copy=节点冲突副本；manual=attrs/edges 人工项。 */
  source: 'copy' | 'manual';
}

type SyncMergeResult = MergeReport & {
  insertNodes: NodeEntity[];
  insertAttrs: AttributeEntity[];
  insertEdges: EdgeEntity[];
};

export interface SyncMergePlan {
  bookId: string;
  /** 无冲突、将被自动应用的实体数（节点 + 边）。 */
  applied: number;
  skipped: number;
  conflicts: SyncConflictItem[];
  /** 合并明细，applySyncPlan 消费；UI 只读 conflicts/applied/skipped。 */
  report: SyncMergeResult;
  bundle: SyncBundle;
  local: EntitySnapshot;
}

export interface SyncApplyReport {
  applied: number;
  /** 本次写入的属性数（新节点随迁 + 既有节点新增补插）。 */
  appliedAttrs: number;
  conflictCopies: Array<{ id: string; title: string }>;
  skipped: number;
  manual: number;
  /** 选择"待处理"时未落地、已记入恢复记录的冲突数。 */
  pendingConflicts: number;
}

async function prepareSync(bundle: SyncBundle): Promise<SyncMergePlan> {
  const local = await readEntities(bundle.bookId);
  const report = mergeBundle(bundle, localState(local));
  const conflicts: SyncConflictItem[] = [
    ...report.conflictCopies.map((c) => ({
      entityName: 'nodes' as const,
      entityId: c.sourceId,
      title: c.node.title,
      reason: '节点双方都改：本地保留，远端以冲突副本落库',
      source: 'copy' as const,
    })),
    ...report.manual.map((m) => ({
      entityName: m.entityName === 'edges' ? 'edges' as const : 'attrs' as const,
      entityId: m.entityId,
      reason: m.reason,
      source: 'manual' as const,
    })),
  ];
  return {
    bookId: bundle.bookId,
    applied: report.applied.length + report.insertEdges.length,
    skipped: report.skipped.length,
    conflicts,
    report,
    bundle,
    local,
  };
}

/** 选择文件 → 解析 → 预合并（不落库），返回待决策的合并计划；取消返回 null。 */
export async function prepareImportBundle(): Promise<SyncMergePlan | null> {
  const api = window.electronAPI;
  if (!api) throw new Error('同步需要桌面环境');
  const picked = await api.openFileDialog({ title: '导入同步包', filters: [{ name: 'AI Novel Sync', extensions: ['json'] }], properties: ['openFile'] } satisfies FileDialogOptions);
  if (picked.canceled || !picked.filePaths[0]) return null;
  const raw = await api.readFile(picked.filePaths[0]);
  return prepareSync(JSON.parse(raw) as SyncBundle);
}

/**
 * 从传输后端下载同步包并预合并（不落库）。远端对象不存在时抛出可读错误；
 * 下载失败按 retry 选项重试（默认 3 次）。
 */
export async function prepareDownloadBundle(
  config: SyncTransportConfig,
  key: string,
  options: RetryOptions = {},
): Promise<SyncMergePlan> {
  const raw = await getSyncObject(config, key, options);
  if (raw === null || raw === undefined) throw new Error(`远端不存在同步包：${key}`);
  return prepareSync(JSON.parse(raw) as SyncBundle);
}

/** 用已持有的同步包重新预合并（重解已登记冲突，无需重新导入整包）。 */
export async function prepareBundlePlan(bundle: SyncBundle): Promise<SyncMergePlan> {
  return prepareSync(bundle);
}

async function upsertNode(node: NodeEntity): Promise<void> {
  const hash = await hashEntity('nodes', node);
  await db().run('nodes.upsert', [node.id, node.bookId, node.type, node.title, node.body, node.path ?? null, node.createdAt, node.updatedAt, node.erased ? 1 : 0, hash]);
}

async function upsertAttr(attr: AttributeEntity): Promise<void> {
  const hash = await hashEntity('attrs', attr);
  await db().run('attrs.upsert', [attr.id, attr.nodeId, attr.type, attr.name, attr.value, attr.inheritable ? 1 : 0, attr.position, attr.erased ? 1 : 0, hash]);
}

async function upsertEdge(edge: EdgeEntity): Promise<void> {
  const hash = await hashEntity('edges', edge);
  await db().run('edges.upsert', [edge.id, edge.fromId, edge.toId, edge.kind, edge.role ?? null, edge.position, edge.bookId, edge.erased ? 1 : 0, hash]);
}

/** 远端实体在浏览器包中的同 id 当前值。 */
function remoteNode(bundle: SyncBundle, id: string): NodeEntity | undefined {
  return bundle.entities.nodes.find((n) => n.id === id);
}
function remoteAttrsOf(bundle: SyncBundle, nodeId: string): AttributeEntity[] {
  return bundle.entities.attrs.filter((a) => a.nodeId === nodeId);
}
function remoteAttr(bundle: SyncBundle, id: string): AttributeEntity | undefined {
  return bundle.entities.attrs.find((a) => a.id === id);
}
function remoteEdge(bundle: SyncBundle, id: string): EdgeEntity | undefined {
  return bundle.entities.edges.find((e) => e.id === id);
}

/** 应用远端替换：覆盖本地节点/属性，软删本地多出的属性，人工项也以远端覆盖。 */
async function applyRemoteReplace(plan: SyncMergePlan): Promise<void> {
  for (const copy of plan.report.conflictCopies) {
    const node = remoteNode(plan.bundle, copy.sourceId);
    if (!node) continue;
    await upsertNode(node);
    const attrs = remoteAttrsOf(plan.bundle, copy.sourceId);
    for (const attr of attrs) await upsertAttr(attr);
    const keep = new Set(attrs.map((a) => a.id));
    for (const local of plan.local.attrs) {
      if (local.nodeId !== copy.sourceId || local.erased || keep.has(local.id)) continue;
      await upsertAttr({ ...local, erased: true });
    }
  }
  for (const item of plan.report.manual) {
    if (item.entityName === 'attrs') {
      const attr = remoteAttr(plan.bundle, item.entityId);
      if (attr) await upsertAttr(attr);
    } else if (item.entityName === 'edges') {
      const edge = remoteEdge(plan.bundle, item.entityId);
      if (edge) await upsertEdge(edge);
    }
  }
}

/**
 * 按策略落地合并计划：
 * - keep-copy：无冲突项直接应用，冲突以新 id 副本落库（本地保留）；
 * - use-remote：无冲突项照常，冲突项以远端覆盖本地；
 * - defer：无冲突项照常，冲突项不改动（待处理，由调用方记入恢复记录）。
 */
export async function applySyncPlan(plan: SyncMergePlan, policy: SyncConflictPolicy): Promise<SyncApplyReport> {
  const { report } = plan;
  const copyIds = new Set(report.conflictCopies.map((c) => c.node.id));
  const baseNodes = report.insertNodes.filter((n) => !copyIds.has(n.id));
  const baseAttrs = report.insertAttrs.filter((a) => !copyIds.has(a.nodeId));

  for (const node of baseNodes) await upsertNode(node);
  for (const attr of baseAttrs) await upsertAttr(attr);
  for (const edge of report.insertEdges) await upsertEdge(edge);

  if (policy === 'keep-copy') {
    for (const copy of report.conflictCopies) {
      await upsertNode(copy.node);
      for (const attr of copy.attrs) await upsertAttr(attr);
    }
  } else if (policy === 'use-remote') {
    await applyRemoteReplace(plan);
  }

  return {
    applied: baseNodes.length + report.insertEdges.length,
    appliedAttrs: baseAttrs.length,
    conflictCopies: policy === 'keep-copy'
      ? report.conflictCopies.map((c) => ({ id: c.node.id, title: c.node.title }))
      : [],
    skipped: report.skipped.length,
    manual: report.manual.length,
    pendingConflicts: policy === 'defer' ? plan.conflicts.length : 0,
  };
}
