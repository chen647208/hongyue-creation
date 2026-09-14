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
});
