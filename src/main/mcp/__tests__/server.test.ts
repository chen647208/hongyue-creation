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

import { dispatch,querySearchNodes } from '../server.js';

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
  it('resources/list 宣告单书目录模板', () => {
    const out = dispatch('resources/list', {}) as { resources: Array<{ uri?: string; uriTemplate?: string }> };
    expect(out.resources.some((r) => r.uri === 'books://index')).toBe(true);
    expect(out.resources.some((r) => r.uriTemplate === 'book://{bookId}/toc')).toBe(true);
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
