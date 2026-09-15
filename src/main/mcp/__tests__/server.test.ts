/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach,beforeEach, describe, expect, it } from 'vitest';

import { chapterText,closeDb,dispatch,entitiesText,querySearchNodes,statsText,tocText } from '../server.js';

let dir = '';
let prevEnv: string | undefined;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hongyue-mcp-'));
  prevEnv = process.env.HONGYUE_DATA_DIR;
  process.env.HONGYUE_DATA_DIR = dir;
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.HONGYUE_DATA_DIR;
  else process.env.HONGYUE_DATA_DIR = prevEnv;
  fs.rmSync(dir, { recursive: true, force: true });
});

function readProposals(): Array<Record<string, unknown>> {
  const file = path.join(dir, 'ai-sessions', 'pending-proposals.jsonl');
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('mcp dispatch', () => {
  it('resources/list 宣告单书目录/实体/单章/统计模板', () => {
    const out = dispatch('resources/list', {}) as { resources: Array<{ uri?: string; uriTemplate?: string }> };
    expect(out.resources.some((r) => r.uri === 'books://index')).toBe(true);
    const templates = out.resources.map((r) => r.uriTemplate);
    expect(templates).toEqual(expect.arrayContaining([
      'book://{bookId}/toc',
      'book://{bookId}/entities',
      'book://{bookId}/chapter/{chapterId}',
      'book://{bookId}/stats',
    ]));
  });

  it('提案工具带 _meta 标记（宿主据此不重复弹批），读工具不带', () => {
    const out = dispatch('tools/list', {}) as { tools: Array<{ name: string; _meta?: Record<string, unknown> }> };
    const byName = (name: string) => out.tools.find((t) => t.name === name);
    expect(byName('propose_chapter_write')?._meta?.['hongyue/proposal']).toBe(true);
    expect(byName('propose_card_write')?._meta?.['hongyue/proposal']).toBe(true);
    expect(byName('list_nodes')?._meta).toBeUndefined();
  });

  it('propose_chapter_write 落盘保留完整执行参数', () => {
    const out = dispatch('tools/call', {
      name: 'propose_chapter_write',
      arguments: { title: '重写第 3 章', nodeId: 'ch3', body: '新正文', bookId: 'book1' },
    }) as { content: Array<{ text: string }> };
    expect(out.content[0]!.text).toContain('待审箱');
    const [line] = readProposals();
    const proposal = line!['proposal'] as { exec: Record<string, unknown>; suggestion: string };
    expect(proposal.exec).toMatchObject({
      kind: 'chapter-write',
      bookId: 'book1',
      nodeId: 'ch3',
      title: '重写第 3 章',
      body: '新正文',
    });
    expect(proposal.suggestion).toBe('新正文');
  });

  it('propose_card_write 落盘保留类型与标题', () => {
    dispatch('tools/call', {
      name: 'propose_card_write',
      arguments: { title: '新反派', type: 'character', body: '背景…', bookId: 'book1' },
    });
    const [line] = readProposals();
    const proposal = line!['proposal'] as { exec: Record<string, unknown> };
    expect(proposal.exec).toMatchObject({ kind: 'card-write', type: 'character', title: '新反派' });
  });

  it('未知方法抛错', () => {
    expect(() => dispatch('nope/method', {})).toThrow('未知方法');
  });

  it('资源读取工具以只读形态宣告（read_toc/read_entities/read_stats/read_chapter）', () => {
    const out = dispatch('tools/list', {}) as { tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }> };
    for (const name of ['read_toc', 'read_entities', 'read_stats', 'read_chapter']) {
      expect(out.tools.find((t) => t.name === name)?.annotations?.readOnlyHint).toBe(true);
    }
  });

  it('资源读取工具经 dispatch 复用资源实现（与外部客户端同源）', () => {
    const dbFile = path.join(dir, 'hongyue.db');
    const db = new Database(dbFile);
    db.exec(`CREATE TABLE nodes (
      id TEXT PRIMARY KEY, book_id TEXT, type TEXT, title TEXT, body TEXT, updated_at INTEGER, erased INTEGER NOT NULL DEFAULT 0
    )`);
    db.exec(`CREATE TABLE attrs (
      node_id TEXT, name TEXT, value TEXT, position INTEGER, erased INTEGER NOT NULL DEFAULT 0
    )`);
    const ins = db.prepare('INSERT INTO nodes(id, book_id, type, title, body, updated_at, erased) VALUES(?,?,?,?,?,?,0)');
    ins.run('ch1', 'book1', 'novel.chapter', '第一章', '正文一', 1);
    ins.run('card1', 'book1', 'world.character', '林渊', '', 1);
    db.prepare('INSERT INTO attrs(node_id, name, value, position, erased) VALUES(?,?,?,?,0)').run('ch1', 'pov', '第一人称', 0);
    db.close();

    try {
      const text = (name: string, args: Record<string, unknown>): string => {
        const out = dispatch('tools/call', { name, arguments: args }) as { content: Array<{ text: string }> };
        return out.content[0]!.text;
      };
      expect(text('read_toc', { bookId: 'book1' })).toContain('[novel.chapter] 第一章 (ch1)');
      expect(text('read_entities', { bookId: 'book1' })).toContain('林渊');
      expect(text('read_stats', { bookId: 'book1' })).toContain('节点总数：2');
      expect(text('read_chapter', { bookId: 'book1', chapterId: 'ch1' })).toContain('正文一');
      expect(text('read_chapter', { bookId: 'book1', chapterId: 'missing' })).toContain('章节不存在');
    } finally {
      // 主进程只读连接按单例缓存；测试结束显式关闭，Windows 上才能删除临时目录
      closeDb();
    }
  });
});

describe('search_nodes（FTS）', () => {
  function makeDb(): Database.Database {
    const db = new Database(':memory:');
    db.exec(`CREATE VIRTUAL TABLE nodes_fts USING fts5(
      book_id UNINDEXED, node_id UNINDEXED, type UNINDEXED, title, content, tokenize = 'trigram'
    )`);
    db.exec(`CREATE TABLE nodes (
      id TEXT PRIMARY KEY, book_id TEXT, type TEXT, title TEXT, body TEXT, erased INTEGER NOT NULL DEFAULT 0
    )`);
    db.exec(`CREATE TABLE attrs (
      node_id TEXT, name TEXT, value TEXT, erased INTEGER NOT NULL DEFAULT 0
    )`);
    const insFts = db.prepare('INSERT INTO nodes_fts(book_id, node_id, type, title, content) VALUES(?,?,?,?,?)');
    const insNode = db.prepare('INSERT INTO nodes(id, book_id, type, title, body, erased) VALUES(?,?,?,?,?,0)');
    // 章节与知识库进 FTS；角色卡只进 nodes（标题回退覆盖）
    insFts.run('book1', 'ch1', 'novel.chapter', '古城堡的清晨', '他走进沉睡千年的古城堡');
    insFts.run('book1', 'kn1', 'meta.knowledge', '魔法体系', '星辰之力驱动的魔法学院');
    insFts.run('book2', 'ch2', 'novel.chapter', '古城堡之谜', '另一本书的古城堡');
    insNode.run('ch1', 'book1', 'novel.chapter', '古城堡的清晨', '他走进沉睡千年的古城堡');
    insNode.run('kn1', 'book1', 'meta.knowledge', '魔法体系', '星辰之力驱动的魔法学院');
    insNode.run('card1', 'book1', 'world.character', '古城堡的领主', '');
    insNode.run('ch2', 'book2', 'novel.chapter', '古城堡之谜', '另一本书的古城堡');
    return db;
  }

  it('正文命中 + 标题回退：结果映射为 {id,type,title}，字段形态固定', () => {
    const db = makeDb();
    try {
      const hits = querySearchNodes(db, 'book1', '古城堡');
      expect(hits.map((h) => h.id).sort()).toEqual(['card1', 'ch1']);
      for (const hit of hits) {
        expect(Object.keys(hit).sort()).toEqual(['id', 'title', 'type']);
      }
    } finally {
      db.close();
    }
  });

  it('按标题命中且限定 bookId', () => {
    const db = makeDb();
    try {
      expect(querySearchNodes(db, 'book1', '魔法体系').map((h) => h.id)).toEqual(['kn1']);
      expect(querySearchNodes(db, 'book1', '古城堡之谜')).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('查询词短于 trigram 门槛返回空', () => {
    const db = makeDb();
    try {
      expect(querySearchNodes(db, 'book1', '古城')).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe('资源读取（目录/实体/单章/统计）', () => {
  function makeDb(): Database.Database {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE nodes (
      id TEXT PRIMARY KEY, book_id TEXT, type TEXT, title TEXT, body TEXT, updated_at INTEGER, erased INTEGER NOT NULL DEFAULT 0
    )`);
    db.exec(`CREATE TABLE attrs (
      node_id TEXT, name TEXT, value TEXT, position INTEGER, erased INTEGER NOT NULL DEFAULT 0
    )`);
    const ins = db.prepare('INSERT INTO nodes(id, book_id, type, title, body, updated_at, erased) VALUES(?,?,?,?,?,?,0)');
    ins.run('ch1', 'book1', 'novel.chapter', '第一章', '正文一', 1);
    ins.run('card1', 'book1', 'world.character', '林渊', '', 1);
    ins.run('loc1', 'book1', 'world.location', '古城', '', 1);
    ins.run('kn1', 'book1', 'meta.knowledge', '设定集', '知识', 1);
    db.prepare('INSERT INTO attrs(node_id, name, value, position, erased) VALUES(?,?,?,?,0)').run('ch1', 'pov', '第一人称', 0);
    return db;
  }

  it('tocText 列出全部节点', () => {
    const db = makeDb();
    try {
      expect(tocText(db, 'book1')).toContain('[novel.chapter] 第一章 (ch1)');
    } finally {
      db.close();
    }
  });

  it('entitiesText 只列设定实体（排除章节与知识库）', () => {
    const db = makeDb();
    try {
      const text = entitiesText(db, 'book1');
      expect(text).toContain('world.character');
      expect(text).toContain('林渊');
      expect(text).not.toContain('meta.knowledge');
      expect(text).not.toContain('novel.chapter');
    } finally {
      db.close();
    }
  });

  it('chapterText 读单章标题/属性/正文，越界或跨书返回 null', () => {
    const db = makeDb();
    try {
      const text = chapterText(db, 'book1', 'ch1');
      expect(text).toContain('第一章');
      expect(text).toContain('@pov: 第一人称');
      expect(text).toContain('正文一');
      expect(chapterText(db, 'book1', 'nope')).toBeNull();
      expect(chapterText(db, 'book2', 'ch1')).toBeNull();
    } finally {
      db.close();
    }
  });

  it('statsText 汇总节点数与类型字数', () => {
    const db = makeDb();
    try {
      const text = statsText(db, 'book1');
      expect(text).toContain('节点总数：4');
      expect(text).toContain('novel.chapter: 1 个');
    } finally {
      db.close();
    }
  });
});
