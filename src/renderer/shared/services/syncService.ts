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
import type { FileDialogOptions, SaveDialogOptions } from '@shared/types';

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

/** 导出某本书的同步包（JSON），写入用户选择的路径。 */
export async function exportSyncBundle(bookId: string, bookTitle: string): Promise<SyncBundleExport> {
  const entities = await readEntities(bookId);
  let seq = 0;
  const changes = [
    ...entities.nodes.map((n) => ({ changeId: ++seq, entityName: 'nodes' as const, entityId: n.id, hash: canonicalOf(n), isErased: n.erased, agentId: 'sync', utcDateChanged: n.updatedAt })),
    ...entities.edges.map((e) => ({ changeId: ++seq, entityName: 'edges' as const, entityId: e.id, hash: canonicalOf(e), isErased: e.erased, agentId: 'sync', utcDateChanged: 0 })),
    ...entities.attrs.map((a) => ({ changeId: ++seq, entityName: 'attrs' as const, entityId: a.id, hash: canonicalOf(a), isErased: a.erased, agentId: 'sync', utcDateChanged: 0 })),
  ];
  const bundle = buildBundle({ bookId, instanceId: getInstanceId(), changes, entities });

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
  return { path: save.filePath, changeCount: changes.length };
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

/** 导入同步包：选择文件 → 合并 → 应用插入集 → 返回报告。 */
export async function importSyncBundle(): Promise<SyncApplyReport> {
  const api = window.electronAPI;
  if (!api) throw new Error('同步需要桌面环境');
  const picked = await api.openFileDialog({ title: '导入同步包', filters: [{ name: 'AI Novel Sync', extensions: ['json'] }], properties: ['openFile'] } satisfies FileDialogOptions);
  if (picked.canceled || !picked.filePaths[0]) throw new Error('已取消导入');
  const raw = await api.readFile(picked.filePaths[0]);
  const bundle = JSON.parse(raw) as SyncBundle;

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

  return {
    applied: report.applied.length,
    conflictCopies: report.conflictCopies.map((c) => ({ id: c.node.id, title: c.node.title })),
    skipped: report.skipped.length,
    manual: report.manual.length,
  };
}
