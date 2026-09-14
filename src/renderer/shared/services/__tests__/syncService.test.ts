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
 * 同步包读写契约：读写一律经 SQL 语句 id（catalog 单源），不得传原始 SQL 文本；
 * 冲突三选只改变落地策略，冲突分类仍来自 mergeBundle。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@core/entities', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getInstanceId: () => 'inst-test', hashEntity: vi.fn(async () => 'hash-x') };
});

import {
  applySyncPlan,
  exportSyncBundle,
  prepareBundlePlan,
  prepareDownloadBundle,
  prepareImportBundle,
  syncObjectKey,
  uploadSyncBundle,
} from '../syncService';

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
    version: 1 as const, bookId: 'b1', instanceId: 'remote', generatedAt: 1,
    changes: [
      ...nodes.map((n) => ({ changeId: 1, entityName: 'nodes' as const, entityId: n.id, hash: 'remote-hash', isErased: false, agentId: 'sync', utcDateChanged: 1 })),
      ...edges.map((e) => edgeChange(e.id)),
    ],
    entities: { nodes, edges, attrs: [] },
  };
}

/** 单节点冲突包：远端 n1 正文与本地不同，触发冲突副本。 */
function conflictBundle(remoteBody: string) {
  const remoteNode = { id: 'n1', bookId: 'b1', type: 'novel.chapter', title: '第一章', body: remoteBody, path: undefined, createdAt: 1, updatedAt: 5, erased: false };
  return {
    version: 1 as const, bookId: 'b1', instanceId: 'remote', generatedAt: 1,
    changes: [{ changeId: 1, entityName: 'nodes' as const, entityId: 'n1', hash: 'remote-hash', isErased: false, agentId: 'sync', utcDateChanged: 5 }],
    entities: { nodes: [remoteNode], edges: [], attrs: [] },
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
  const sync = {
    testTransport: vi.fn(async () => ({ ok: true, message: 'ok' })),
    put: vi.fn(async (_config: unknown, _key: string, _data: string) => ({ ok: true })),
    get: vi.fn(async (_config: unknown, _key: string): Promise<string | null> => fileContent.value),
    list: vi.fn(async () => []),
    remove: vi.fn(async (_config: unknown, _key: string) => ({ ok: true })),
  };
  vi.stubGlobal('window', {
    electronAPI: {
      db: { all: dbAll, run: dbRun },
      saveFileDialog: async () => ({ canceled: false, filePath: '/tmp/sync.json' }),
      openFileDialog: async () => ({ canceled: false, filePaths: ['/tmp/sync.json'] }),
      writeFile,
      readFile: vi.fn(async () => fileContent.value),
      sync,
    },
  });
  return { dbAll, dbRun, writeFile, fileContent, writes, sync };
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

describe('prepareImportBundle + applySyncPlan（无冲突）', () => {
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

    const plan = await prepareImportBundle();
    expect(plan).not.toBeNull();
    expect(plan!.conflicts).toHaveLength(0);
    const report = await applySyncPlan(plan!, 'keep-copy');

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

    const plan = await prepareImportBundle();
    const report = await applySyncPlan(plan!, 'keep-copy');

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

    const plan = await prepareImportBundle();
    const report = await applySyncPlan(plan!, 'keep-copy');

    expect(writes.map((w) => w.id)).toEqual(['edges.upsert']);
    expect(report.applied).toBe(1);
  });

  it('重复导入同一条边：幂等，不重复写', async () => {
    const edge = edgeEntity('e:n1>n2:contain:', 'n1', 'n2');
    const { writes } = stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [], 'edges.selectByBook': [localEdgeRow(edge)] },
      fileContent: { value: JSON.stringify(edgeBundle([edge])) },
    });

    const plan = await prepareImportBundle();
    const report = await applySyncPlan(plan!, 'keep-copy');

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

    const plan = await prepareImportBundle();
    const report = await applySyncPlan(plan!, 'keep-copy');

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

    const plan = await prepareImportBundle();
    const report = await applySyncPlan(plan!, 'keep-copy');

    expect(writes).toHaveLength(0);
    expect(report.applied).toBe(0);
    expect(report.manual).toBe(1);
  });
});

describe('冲突三选的分支逻辑', () => {
  function conflictApi() {
    return stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [attrRow], 'edges.selectByBook': [] },
      fileContent: { value: JSON.stringify(conflictBundle('远端改写的正文')) },
    });
  }

  it('预合并列出冲突，且不写库', async () => {
    const { writes } = conflictApi();
    const plan = await prepareImportBundle();
    expect(plan!.conflicts).toHaveLength(1);
    expect(plan!.conflicts[0]!.entityId).toBe('n1');
    expect(plan!.conflicts[0]!.source).toBe('copy');
    expect(writes).toHaveLength(0);
  });

  it('保留冲突副本：远端以新 id 落库，本地原节点不动', async () => {
    const { writes } = conflictApi();
    const plan = await prepareImportBundle();
    const report = await applySyncPlan(plan!, 'keep-copy');

    expect(report.conflictCopies).toHaveLength(1);
    expect(report.pendingConflicts).toBe(0);
    expect(writes.map((w) => w.id)).toEqual(['nodes.upsert']);
    const copyId = writes[0]!.params[0] as string;
    expect(copyId).toContain('conflict-n1-');
    expect(writes[0]!.params[4]).toBe('远端改写的正文');
  });

  it('应用远端替换：以原 id 覆盖本地，并软删本地多出的属性', async () => {
    const { writes } = conflictApi();
    const plan = await prepareImportBundle();
    const report = await applySyncPlan(plan!, 'use-remote');

    expect(report.conflictCopies).toHaveLength(0);
    const nodeWrite = writes.find((w) => w.id === 'nodes.upsert')!;
    expect(nodeWrite.params[0]).toBe('n1');
    expect(nodeWrite.params[4]).toBe('远端改写的正文');
    const attrWrite = writes.find((w) => w.id === 'attrs.upsert')!;
    expect(attrWrite.params[0]).toBe('a1');
    expect(attrWrite.params[7]).toBe(1);
  });

  it('标记待处理：不写冲突项，报告待处理数', async () => {
    const { writes } = conflictApi();
    const plan = await prepareImportBundle();
    const report = await applySyncPlan(plan!, 'defer');

    expect(writes).toHaveLength(0);
    expect(report.pendingConflicts).toBe(1);
    expect(report.conflictCopies).toHaveLength(0);
  });
});

describe('prepareBundlePlan（重解已登记冲突）', () => {
  it('用留档同步包重新预合并，无需重新导入文件', async () => {
    const { sync, writes } = stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [attrRow], 'edges.selectByBook': [] },
      fileContent: { value: JSON.stringify(conflictBundle('远端改写的正文')) },
    });

    const plan = await prepareBundlePlan(conflictBundle('远端改写的正文'));

    expect(plan.conflicts).toHaveLength(1);
    expect(writes).toHaveLength(0);
    expect(sync.get).not.toHaveBeenCalled();
  });
});

describe('既有节点新增属性补插', () => {
  it('节点未变、远端新增属性时写入 attrs.upsert', async () => {
    const remoteAttr = {
      id: 'a9', nodeId: 'n1', type: 'label', name: '标签', value: '远端新增',
      inheritable: false, position: 0, erased: false,
    };
    const bundle = {
      version: 1, bookId: 'b1', instanceId: 'remote', generatedAt: 1,
      changes: [
        { changeId: 1, entityName: 'nodes' as const, entityId: 'n1', hash: 'remote-hash', isErased: false, agentId: 'sync', utcDateChanged: 1 },
        { changeId: 2, entityName: 'attrs' as const, entityId: 'a9', hash: 'remote-attr-hash', isErased: false, agentId: 'sync', utcDateChanged: 1 },
      ],
      entities: { nodes: [nodeEntity('n1', '第一章')], edges: [], attrs: [remoteAttr] },
    };
    const { writes } = stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [attrRow], 'edges.selectByBook': [] },
      fileContent: { value: JSON.stringify(bundle) },
    });

    const plan = await prepareImportBundle();
    const report = await applySyncPlan(plan!, 'keep-copy');

    expect(report.appliedAttrs).toBe(1);
    expect(writes.map((w) => w.id)).toEqual(['attrs.upsert']);
    expect(writes[0]!.params[0]).toBe('a9');
  });
});

describe('uploadSyncBundle', () => {
  it('导出并上传到传输后端，默认键按书 id', async () => {
    const { sync, writeFile } = stubApi({
      rows: {
        'nodes.selectByBook': [nodeRow],
        'attrs.selectByBook': [attrRow],
        'edges.selectByBook': [edgeRow],
      },
    });

    const result = await uploadSyncBundle('b1', { kind: 'local', directory: '/x' }, { maxAttempts: 1 });

    expect(result).toEqual({ key: 'hongyue-sync/b1.json', changeCount: 3 });
    expect(syncObjectKey('b1')).toBe('hongyue-sync/b1.json');
    expect(writeFile).not.toHaveBeenCalled();
    const [config, key, data] = sync.put.mock.calls[0]!;
    expect(config).toEqual({ kind: 'local', directory: '/x' });
    expect(key).toBe('hongyue-sync/b1.json');
    expect((JSON.parse(data) as { bookId: string }).bookId).toBe('b1');
  });
});

describe('prepareDownloadBundle', () => {
  it('下载远端同步包并预合并', async () => {
    const remoteNode = {
      id: 'n2', bookId: 'b1', type: 'novel.chapter', title: '第二章', body: '远端正文',
      path: undefined, createdAt: 3, updatedAt: 4, erased: false,
    };
    const bundle = {
      version: 1, bookId: 'b1', instanceId: 'remote', generatedAt: 1,
      changes: [{ changeId: 1, entityName: 'nodes', entityId: 'n2', hash: 'deadbeef', isErased: false, agentId: 'sync', utcDateChanged: 1 }],
      entities: { nodes: [remoteNode], edges: [], attrs: [] },
    };
    const { sync, writes } = stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [], 'edges.selectByBook': [] },
      fileContent: { value: JSON.stringify(bundle) },
    });

    const plan = await prepareDownloadBundle({ kind: 'local', directory: '/x' }, 'hongyue-sync/b1.json', { maxAttempts: 1 });
    expect(plan.applied).toBe(1);
    const report = await applySyncPlan(plan, 'keep-copy');

    expect(report.applied).toBe(1);
    expect(writes.map((w) => w.id)).toEqual(['nodes.upsert']);
    expect(sync.get).toHaveBeenCalledWith({ kind: 'local', directory: '/x' }, 'hongyue-sync/b1.json');
  });

  it('远端对象缺失时抛可读错误', async () => {
    const { sync } = stubApi();
    sync.get.mockResolvedValueOnce(null);

    await expect(
      prepareDownloadBundle({ kind: 'local', directory: '/x' }, 'missing.json', { maxAttempts: 1 }),
    ).rejects.toThrow('远端不存在同步包');
  });

  it('瞬时失败按重试次数重试后成功', async () => {
    const bundle = edgeBundle(
      [edgeEntity('e:n2>n3:contain:', 'n2', 'n3')],
      [nodeEntity('n2', '第二章'), nodeEntity('n3', '第三章')],
    );
    const { sync } = stubApi({
      rows: { 'nodes.selectByBook': [nodeRow], 'attrs.selectByBook': [], 'edges.selectByBook': [] },
    });
    sync.get.mockRejectedValueOnce(new Error('网络抖动')).mockResolvedValueOnce(JSON.stringify(bundle));

    const plan = await prepareDownloadBundle({ kind: 'local', directory: '/x' }, 'k.json', { maxAttempts: 2, delayMs: 0 });

    expect(sync.get).toHaveBeenCalledTimes(2);
    expect(plan.applied).toBe(3);
  });
});
