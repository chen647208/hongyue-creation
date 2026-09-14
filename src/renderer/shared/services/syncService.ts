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
 * 导入：读 bundle → mergeBundle（LWW 禁用）→ INSERT OR REPLACE 应用插入集
 * （冲突副本以新 id 落库、本地保留），返回报告供 UI 展示。
 */
import type { AttributeEntity, EdgeEntity,NodeEntity } from '@core/entities';
import { getInstanceId,hashEntity } from '@core/entities';
import { buildBundle, canonicalHash, type EntitySnapshot, localState, mergeBundle, type SyncBundle } from '@core/sync';
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
  return { id: r.id, fromId: r.from_id, toId: r.to_id, kind: r.kind as NodeEntity['bookId'] extends never ? never : EdgeEntity['kind'], role: r.role ?? undefined, position: Number(r.position), bookId: r.book_id, erased: r.erased === 1 };
}

async function readEntities(bookId: string): Promise<EntitySnapshot> {
  const nodeRows = (await db().all('nodes.selectByBook', [bookId])) as unknown as NodeRow[];
  const attrRows = (await db().all('attrs.selectByBook', [bookId])) as unknown as AttrRow[];
  const edgeRows = (await db().all('edges.selectByBook', [bookId])) as unknown as EdgeRow[];
  return { nodes: nodeRows.map(toNode), attrs: attrRows.map(toAttr), edges: edgeRows.map(toEdge) };
}

export interface SyncBundleExport { path: string; changeCount: number }

/** 合成某本书的同步包（导出与上传共用）。 */
async function buildSyncBundle(bookId: string): Promise<{ bundle: SyncBundle; changeCount: number }> {
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

/** 同步对象在传输后端上的默认键；多书共用一个传输目录。 */
export function syncObjectKey(bookId: string): string {
  return `hongyue-sync/${bookId}.json`;
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

export interface SyncApplyReport {
  applied: number;
  conflictCopies: Array<{ id: string; title: string }>;
  skipped: number;
  manual: number;
}

/** 合并同步包并应用插入集（导入与下载共用）。 */
async function applyBundle(bundle: SyncBundle): Promise<SyncApplyReport> {
  const local = localState(await readEntities(bundle.bookId));
  const report = mergeBundle(bundle, local);

  for (const node of report.insertNodes) {
    const hash = await hashEntity('nodes', node);
    await db().run('nodes.upsert', [node.id, node.bookId, node.type, node.title, node.body, node.path ?? null, node.createdAt, node.updatedAt, node.erased ? 1 : 0, hash]);
  }
  for (const attr of report.insertAttrs) {
    const hash = await hashEntity('attrs', attr);
    await db().run('attrs.upsert', [attr.id, attr.nodeId, attr.type, attr.name, attr.value, attr.inheritable ? 1 : 0, attr.position, attr.erased ? 1 : 0, hash]);
  }
  for (const edge of report.insertEdges) {
    const hash = await hashEntity('edges', edge);
    await db().run('edges.upsert', [edge.id, edge.fromId, edge.toId, edge.kind, edge.role ?? null, edge.position, edge.bookId, edge.erased ? 1 : 0, hash]);
  }

  return {
    applied: report.applied.length + report.insertEdges.length,
    conflictCopies: report.conflictCopies.map((c) => ({ id: c.node.id, title: c.node.title })),
    skipped: report.skipped.length,
    manual: report.manual.length,
  };
}

/** 导入同步包：选择文件 → 合并 → 应用插入集 → 返回报告。 */
export async function importSyncBundle(): Promise<SyncApplyReport> {
  const api = window.electronAPI;
  if (!api) throw new Error('同步需要桌面环境');
  const picked = await api.openFileDialog({ title: '导入同步包', filters: [{ name: 'AI Novel Sync', extensions: ['json'] }], properties: ['openFile'] } satisfies FileDialogOptions);
  if (picked.canceled || !picked.filePaths[0]) throw new Error('已取消导入');
  const raw = await api.readFile(picked.filePaths[0]);
  return applyBundle(JSON.parse(raw) as SyncBundle);
}

/**
 * 从传输后端下载同步包并导入合并。远端对象不存在时抛出可读错误；
 * 下载失败按 retry 选项重试（默认 3 次）。
 */
export async function downloadSyncBundle(
  config: SyncTransportConfig,
  key: string,
  options: RetryOptions = {},
): Promise<SyncApplyReport> {
  const raw = await getSyncObject(config, key, options);
  if (raw === null || raw === undefined) throw new Error(`远端不存在同步包：${key}`);
  return applyBundle(JSON.parse(raw) as SyncBundle);
}
