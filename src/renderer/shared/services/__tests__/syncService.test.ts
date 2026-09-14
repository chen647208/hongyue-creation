// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 同步包读写契约：读写一律经 SQL 语句 id（catalog 单源），不得传原始 SQL 文本。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@core/entities', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getInstanceId: () => 'inst-test', hashEntity: vi.fn(async () => 'hash-x') };
});

import { exportSyncBundle, importSyncBundle } from '../syncService';

const SQL_ID = /^[a-z]+\.[A-Za-z]+$/;

const nodeRow = {
  id: 'n1', book_id: 'b1', type: 'novel.chapter', title: '第一章', body: '正文',
  path: null, created_at: 1, updated_at: 2, erased: 0,
};
const attrRow = {
  id: 'a1', node_id: 'n1', type: 'label', name: '标签', value: '值',
  inheritable: 0, position: 0, erased: 0, book_id: 'b1',
};
const edgeRow = {
  id: 'e1', from_id: 'n1', to_id: 'n1', kind: 'relation', role: null,
  position: 0, book_id: 'b1', erased: 0,
};

function nodeEntity(id: string, title: string) {
  return { id, bookId: 'b1', type: 'novel.chapter', title, body: '正文', path: undefined, createdAt: 1, updatedAt: 2, erased: false };
}

function edgeEntity(id: string, fromId: string, toId: string, kind = 'contain', role?: string) {
  return { id, fromId, toId, kind, role, position: 0, bookId: 'b1', erased: false };
}

function edgeChange(entityId: string) {
  return { changeId: 1, entityName: 'edges' as const, entityId, hash: 'remote-hash', isErased: false, agentId: 'sync', utcDateChanged: 1 };
}

function edgeBundle(edges: ReturnType<typeof edgeEntity>[], nodes: ReturnType<typeof nodeEntity>[] = []) {
  return {
    version: 1, bookId: 'b1', instanceId: 'remote', generatedAt: 1,
    changes: [
      ...nodes.map((n) => ({ changeId: 1, entityName: 'nodes' as const, entityId: n.id, hash: 'remote-hash', isErased: false, agentId: 'sync', utcDateChanged: 1 })),
      ...edges.map((e) => edgeChange(e.id)),
    ],
    entities: { nodes, edges, attrs: [] },
  };
}

function localEdgeRow(edge: ReturnType<typeof edgeEntity>) {
  return { id: edge.id, from_id: edge.fromId, to_id: edge.toId, kind: edge.kind, role: edge.role ?? null, position: edge.position, book_id: edge.bookId, erased: 0 };
}

function stubApi(options: { rows?: Record<string, unknown[]>; fileContent?: { value: string } } = {}) {
  const rows = options.rows ?? {};
  const fileContent = options.fileContent ?? { value: '' };
  const writes: Array<{ id: string; params: unknown[] }> = [];
  const dbAll = vi.fn(async (id: string) => {
    if (!SQL_ID.test(id)) throw new Error(`原始 SQL 不被接受：${id}`);
    return rows[id] ?? [];
  });
  const dbRun = vi.fn(async (id: string, params: unknown[]) => {
    if (!SQL_ID.test(id)) throw new Error(`原始 SQL 不被接受：${id}`);
    writes.push({ id, params });
    return { changes: 1, lastInsertRowid: 0 };
  });
  const writeFile = vi.fn(async (_path: string, content: string) => {
    fileContent.value = content;
    return true;
  });
  vi.stubGlobal('window', {
    electronAPI: {
      db: { all: dbAll, run: dbRun },
      saveFileDialog: async () => ({ canceled: false, filePath: '/tmp/sync.json' }),
      openFileDialog: async () => ({ canceled: false, filePaths: ['/tmp/sync.json'] }),
      writeFile,
      readFile: vi.fn(async () => fileContent.value),
    },
  });
  return { dbAll, dbRun, writeFile, fileContent, writes };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('exportSyncBundle', () => {
  it('按语句 id 读取三实体，写出含变更的同步包', async () => {
    const { dbAll, writeFile, fileContent } = stubApi({
      rows: {
        'nodes.selectByBook': [nodeRow],
        'attrs.selectByBook': [attrRow],
        'edges.selectByBook': [edgeRow],
      },
    });
    const result = await exportSyncBundle('b1', '甲书');

    const ids = dbAll.mock.calls.map((c) => c[0]);
    expect(ids).toEqual(['nodes.selectByBook', 'attrs.selectByBook', 'edges.selectByBook']);
    expect(writeFile).toHaveBeenCalledOnce();
    expect(result.changeCount).toBe(3);

    const bundle = JSON.parse(fileContent.value) as { bookId: string; changes: unknown[] };
    expect(bundle.bookId).toBe('b1');
    expect(bundle.changes).toHaveLength(3);
  });
});

describe('importSyncBundle', () => {
  it('合并后按语句 id 写入节点与属性（不含原始 SQL）', async () => {
    const remoteNode = {
      id: 'n2', bookId: 'b1', type: 'novel.chapter', title: '第二章', body: '远端正文',
      path: undefined, createdAt: 3, updatedAt: 4, erased: false,
    };
    const remoteAttr = {
      id: 'a2', nodeId: 'n2', type: 'label', name: '标签', value: '远端值',
      inheritable: false, position: 0, erased: false,
    };
    const bundle = {
      version: 1, bookId: 'b1', instanceId: 'remote', generatedAt: 1,
      changes: [{ changeId: 1, entityName: 'nodes', entityId: 'n2', hash: 'deadbeef', isErased: false, agentId: 'sync', utcDateChanged: 1 }],
      entities: { nodes: [remoteNode], edges: [], attrs: [remoteAttr] },
    };
    const { dbRun, writes } = stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [attrRow], 'edges.selectByBook': [] },
      fileContent: { value: JSON.stringify(bundle) },
    });

    const report = await importSyncBundle();

    expect(report.applied).toBe(1);
    expect(writes.map((w) => w.id)).toEqual(['nodes.upsert', 'attrs.upsert']);
    expect(writes[0]!.params[0]).toBe('n2');
    expect(dbRun.mock.calls.every((c) => SQL_ID.test(c[0]))).toBe(true);
  });

  it('远端节点与其之间的边一并落库', async () => {
    const n2 = nodeEntity('n2', '第二章');
    const n3 = nodeEntity('n3', '第三章');
    const edge = edgeEntity('e:n2>n3:contain:', 'n2', 'n3');
    const { writes } = stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [], 'edges.selectByBook': [] },
      fileContent: { value: JSON.stringify(edgeBundle([edge], [n2, n3])) },
    });

    const report = await importSyncBundle();

    expect(writes.map((w) => w.id)).toEqual(['nodes.upsert', 'nodes.upsert', 'edges.upsert']);
    const edgeWrite = writes.find((w) => w.id === 'edges.upsert')!;
    expect(edgeWrite.params.slice(0, 4)).toEqual([edge.id, 'n2', 'n3', 'contain']);
    expect(report.applied).toBe(3);
  });

  it('本地已有节点、远端仅补边：关系不丢', async () => {
    const edge = edgeEntity('e:n1>n2:contain:', 'n1', 'n2');
    const { writes } = stubApi({
      rows: {
        'nodes.selectByBook': [nodeRow, { ...nodeRow, id: 'n2', title: '第二章' }],
        'attrs.selectByBook': [],
        'edges.selectByBook': [],
      },
      fileContent: { value: JSON.stringify(edgeBundle([edge])) },
    });

    const report = await importSyncBundle();

    expect(writes.map((w) => w.id)).toEqual(['edges.upsert']);
    expect(report.applied).toBe(1);
  });

  it('重复导入同一条边：幂等，不重复写', async () => {
    const edge = edgeEntity('e:n1>n2:contain:', 'n1', 'n2');
    const { writes } = stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [], 'edges.selectByBook': [localEdgeRow(edge)] },
      fileContent: { value: JSON.stringify(edgeBundle([edge])) },
    });

    const report = await importSyncBundle();

    expect(writes).toHaveLength(0);
    expect(report.applied).toBe(0);
    expect(report.skipped).toBe(1);
  });

  it('稳定键去重：不同 id 的同一条关系不重复插入', async () => {
    const remote = edgeEntity('e-remote', 'n1', 'n2');
    const local = edgeEntity('e-local', 'n1', 'n2');
    const { writes } = stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [], 'edges.selectByBook': [localEdgeRow(local)] },
      fileContent: { value: JSON.stringify(edgeBundle([remote])) },
    });

    const report = await importSyncBundle();

    expect(writes).toHaveLength(0);
    expect(report.applied).toBe(0);
    expect(report.skipped).toBe(1);
  });

  it('同 id 的边双方都改：报告人工，不自动覆盖', async () => {
    const remote = edgeEntity('e1', 'n1', 'n3');
    const local = edgeEntity('e1', 'n1', 'n2');
    const { writes } = stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [], 'edges.selectByBook': [localEdgeRow(local)] },
      fileContent: { value: JSON.stringify(edgeBundle([remote])) },
    });

    const report = await importSyncBundle();

    expect(writes).toHaveLength(0);
    expect(report.applied).toBe(0);
    expect(report.manual).toBe(1);
  });
});
