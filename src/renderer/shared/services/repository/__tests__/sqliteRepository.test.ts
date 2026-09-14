/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { indexService } from '@core/index';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_STATE_VERSION } from '../../../../../shared/constants/versions';
import { SQL,type SqlId } from '../../../../../shared/sql/catalog';
import type { AppState, Chapter,KnowledgeItem, Project } from '../../../../../shared/types';
import { BUILTIN_ITEM_TYPES,ensureBuiltinItemTypes } from '../builtinTypes';
import { jsonRepository } from '../jsonRepository';
import { migrate,SCHEMA_VERSION } from '../schema';
import { SqliteRepository } from '../sqliteRepository';
import type { SqlDriver, SqlRunResult, SqlValue } from '../types';
import { runWasmRequest } from '../wasmSql';

/**
 * 同一套 SqliteRepository 逻辑，分别用两种真实 SQLite 引擎驱动：
 *   - better-sqlite3（桌面主进程所用）
 *   - @sqlite.org/sqlite-wasm（网页 OPFS worker 所用）
 * 两端共用 schema/迁移/增量写/FTS5(trigram) 检索，这里即其正确性来源。
 */

interface DriverFixture {
  name: string;
  create(): Promise<{
    driver: SqlDriver;
    rawGet<T>(sql: string, params?: SqlValue[]): T | undefined;
    rawAll<T>(sql: string, params?: SqlValue[]): T[];
    dispose(): void;
  }>;
}

const nodeSqliteFixture: DriverFixture = {
  name: 'better-sqlite3',
  async create() {
    const db = new Database(':memory:');
    const driver: SqlDriver = {
      exec: async (id) => { db.exec(SQL[id]); },
      run: async (id, params = []) => {
        const r = db.prepare(SQL[id]).run(...(params as unknown as never[]));
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
      },
      all: async <T>(id: SqlId, params: SqlValue[] = []) => db.prepare(SQL[id]).all(...(params as never[])) as T[],
      get: async <T>(id: SqlId, params: SqlValue[] = []) => db.prepare(SQL[id]).get(...(params as never[])) as T | undefined,
      transaction: async (fn) => {
        db.exec('BEGIN');
        try {
          const result = await fn(driver);
          db.exec('COMMIT');
          return result;
        } catch (e) {
          try { db.exec('ROLLBACK'); } catch { /* noop */ }
          throw e;
        }
      },
      close: async () => { db.close(); },
    };
    return {
      driver,
      rawGet: <T>(sql: string, params: SqlValue[] = []) => db.prepare(sql).get(...(params as never[])) as T,
      rawAll: <T>(sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...(params as never[])) as T[],
      dispose: () => { try { db.close(); } catch { /* noop */ } },
    };
  },
};

const wasmFixture: DriverFixture = {
  name: '@sqlite.org/sqlite-wasm',
  async create() {
    const initModule = sqlite3InitModule as unknown as (
      config?: Record<string, unknown>
    ) => ReturnType<typeof sqlite3InitModule>;
    const sqlite3 = await initModule({ print: () => {}, printErr: () => {} });
    const db = new sqlite3.oo1.DB(':memory:');
    const capi = sqlite3.capi;
    const req = (method: 'exec' | 'run' | 'all' | 'get', sql: string, params: SqlValue[] = []) =>
      runWasmRequest(db, capi, { method, sql, params });
    const driver: SqlDriver = {
      exec: async (id) => { req('exec', SQL[id]); },
      run: async (id, params = []) => req('run', SQL[id], params) as SqlRunResult,
      all: async <T>(id: SqlId, params: SqlValue[] = []) => req('all', SQL[id], params) as T[],
      get: async <T>(id: SqlId, params: SqlValue[] = []) => req('get', SQL[id], params) as T | undefined,
      transaction: async (fn) => {
        req('exec', SQL['engine.begin']);
        try {
          const result = await fn(driver);
          req('exec', SQL['engine.commit']);
          return result;
        } catch (e) {
          try { req('exec', SQL['engine.rollback']); } catch { /* noop */ }
          throw e;
        }
      },
      close: async () => { db.close(); },
    };
    return {
      driver,
      rawGet: <T>(sql: string, params: SqlValue[] = []) => req('get', sql, params) as T,
      rawAll: <T>(sql: string, params: SqlValue[] = []) => req('all', sql, params) as T[],
      dispose: () => { try { db.close(); } catch { /* noop */ } },
    };
  },
};

const chapter = (id: string, title: string, content: string): Chapter =>
  ({ id, title, content, order: 0, summary: '' } as unknown as Chapter);
const knowledge = (id: string, content: string, name = ''): KnowledgeItem =>
  ({ id, content, name, category: 'inspiration' } as unknown as KnowledgeItem);

const project = (id: string, over: Partial<Project> = {}): Project =>
  ({
    id,
    title: `书-${id}`,
    inspiration: '',
    intro: '',
    characters: [],
    outline: '',
    chapters: [],
    virtualChapters: [],
    knowledge: [],
    lastModified: 1000,
    ...over,
  } as unknown as Project);

const baseState = (projects: Project[]): AppState => ({
  schemaVersion: APP_STATE_VERSION,
  projects,
  activeProjectId: projects[0]?.id ?? null,
  models: [{ id: 'm1', name: '模型1' } as never],
  prompts: [],
  activeModelId: 'm1',
  embeddingModels: [],
  activeEmbeddingModelId: null,
});

for (const fixture of [nodeSqliteFixture, wasmFixture]) {
  describe(`SqliteRepository（真实 ${fixture.name} 内存库）`, () => {
    let driver: SqlDriver;
    let rawGet: <T>(sql: string, params?: SqlValue[]) => T | undefined;
    let rawAll: <T>(sql: string, params?: SqlValue[]) => T[];
    let dispose: () => void;
    let repo: SqliteRepository;

    beforeEach(async () => {
      const ctx = await fixture.create();
      driver = ctx.driver;
      rawGet = ctx.rawGet;
      rawAll = ctx.rawAll;
      dispose = ctx.dispose;
      repo = new SqliteRepository(driver);
      indexService.clear(); // 派生索引是进程级单例，逐用例清空避免污染
    });
    afterEach(() => { vi.restoreAllMocks(); dispose(); });

    it('迁移建立 v2 六实体 schema 并写入 schema_version', async () => {
      await repo.saveAll(baseState([]));
      const row = rawGet<{ value: string }>(`SELECT value FROM meta WHERE key='schema_version'`);
      expect(Number(row!.value)).toBe(SCHEMA_VERSION);
      const tables = rawAll<{ name: string }>(`SELECT name FROM sqlite_master WHERE type IN ('table','view')`);
      const names = tables.map(t => t.name);
      expect(names).toEqual(expect.arrayContaining([
        'nodes', 'edges', 'attrs', 'revisions', 'attachments', 'blobs', 'entity_changes', 'nodes_fts', 'settings', 'meta',
        'item_types', 'fields', 'sequence_items', 'views',
      ]));
      // v1 文档行模型已彻底移除
      expect(names).not.toContain('projects');
      expect(names).not.toContain('chapters_fts');
    });

    it('空库 loadAll 返回 null', async () => {
      expect(await repo.loadAll()).toBeNull();
    });

    it('migrate 幂等：重复执行不报错且版本不变', async () => {
      await repo.saveAll(baseState([]));
      await migrate(driver);
      const row = rawGet<{ value: string }>(`SELECT value FROM meta WHERE key='schema_version'`);
      expect(Number(row!.value)).toBe(SCHEMA_VERSION);
    });

    it('init 首启从旧 JSON 迁移一次并写入迁移哨兵', async () => {
      const spy = vi.spyOn(jsonRepository, 'loadAll').mockResolvedValue(baseState([project('legacy1')]));
      await repo.init();
      expect(spy).toHaveBeenCalledTimes(1);
      const loaded = await repo.loadAll();
      expect(loaded!.projects.map(p => p.id)).toEqual(['legacy1']);
      const row = rawGet<{ value: string }>(`SELECT value FROM meta WHERE key='migrated_from_json'`);
      expect(row!.value).toBe('1');
    });

    it('恢复出厂清空后，重启 init 不会二次导入旧 JSON（哨兵存活）', async () => {
      const spy = vi.spyOn(jsonRepository, 'loadAll').mockResolvedValue(baseState([project('legacy1')]));
      await repo.init();                 // 首次迁移
      await repo.clear();                // 恢复出厂：清空数据表，但保留哨兵
      expect(await repo.loadAll()).toBeNull();
      const repo2 = new SqliteRepository(driver); // 模拟重启（migrated 标志复位）
      await repo2.init();
      expect(spy).toHaveBeenCalledTimes(1);      // 第二次 init 命中哨兵，未再读旧 JSON
      expect(await repo2.loadAll()).toBeNull();  // 旧数据未被复活
    });

    it('无旧数据时 init 也置哨兵，避免每次启动重复探测', async () => {
      const spy = vi.spyOn(jsonRepository, 'loadAll').mockResolvedValue(null);
      await repo.init();
      const row = rawGet<{ value: string }>(`SELECT value FROM meta WHERE key='migrated_from_json'`);
      expect(row!.value).toBe('1');
      const repo2 = new SqliteRepository(driver);
      await repo2.init();
      expect(spy).toHaveBeenCalledTimes(1); // 哨兵已置，第二次不再探测旧数据
    });

    it('saveAll → loadAll 往返保留项目/配置/标量', async () => {
      const state = baseState([project('a'), project('b')]);
      state.cardPrompts = [{ id: 'cp' } as never];
      state.consistencyCheckConfig = { mode: 'ai' } as never;
      await repo.saveAll(state);

      const loaded = await repo.loadAll();
      expect(loaded).not.toBeNull();
      expect(loaded!.projects.map(p => p.id).sort()).toEqual(['a', 'b']);
      expect(loaded!.activeProjectId).toBe('a');
      expect(loaded!.models).toHaveLength(1);
      expect(loaded!.activeModelId).toBe('m1');
      expect(loaded!.cardPrompts).toEqual([{ id: 'cp' }]);
      expect(loaded!.consistencyCheckConfig).toEqual({ mode: 'ai' });
    });

    it('saveProject 只 upsert 目标行，不影响其它项目', async () => {
      await repo.saveAll(baseState([project('a'), project('b')]));
      await repo.saveProject(project('a', { title: '改名后的书', lastModified: 9999 }));

      const loaded = await repo.loadAll();
      const a = loaded!.projects.find(p => p.id === 'a')!;
      const b = loaded!.projects.find(p => p.id === 'b')!;
      expect(a.title).toBe('改名后的书');
      expect(b.title).toBe('书-b'); // 未被触碰
    });

    it('saveProject 新增不存在的项会插入', async () => {
      await repo.saveAll(baseState([project('a')]));
      await repo.saveProject(project('c'));
      const loaded = await repo.loadAll();
      expect(loaded!.projects.map(p => p.id).sort()).toEqual(['a', 'c']);
    });

    it('惰性载入：非活动书只给骨架，loadBookContent 补全正文', async () => {
      const a = project('a', { chapters: [chapter('a-c1', '第一章', '甲书正文')] });
      const b = project('b', { chapters: [chapter('b-c1', '第一章', '乙书正文')] });
      await repo.saveAll(baseState([a, b]));

      const loaded = await repo.loadAll();
      const active = loaded!.projects.find(p => p.id === 'a')!;
      const inactive = loaded!.projects.find(p => p.id === 'b')!;
      expect(active.hydrated).toBe(true);
      expect(active.chapters[0]?.content).toBe('甲书正文');
      expect(inactive.hydrated).toBe(false);
      expect(inactive.chapters[0]?.content).toBe('');
      expect(inactive.wordCountCache).toBeGreaterThan(0);

      const full = await repo.loadBookContent('b');
      expect(full?.hydrated).toBe(true);
      expect(full?.chapters[0]?.content).toBe('乙书正文');
    });

    it('未 hydrate 的书保存不会清空正文', async () => {
      const a = project('a', { chapters: [chapter('a-c1', '第一章', '甲书正文')] });
      const b = project('b', { chapters: [chapter('b-c1', '第一章', '乙书正文')] });
      await repo.saveAll(baseState([a, b]));

      const loaded = await repo.loadAll();
      const shellB = loaded!.projects.find(p => p.id === 'b')!;
      expect(shellB.hydrated).toBe(false);
      await repo.saveProject(shellB);

      const full = await repo.loadBookContent('b');
      expect(full?.chapters[0]?.content).toBe('乙书正文');
    });

    it('差分保存：内容未变不写库，仅变更节点追加修订', async () => {
      const count = (sql: string, params: SqlValue[] = []): number =>
        rawAll<{ c: number }>(sql, params)[0]!.c;
      const proj = project('diff', {
        chapters: [chapter('c1', '第一章', '正文一'), chapter('c2', '第二章', '正文二')],
        lastModified: 1000,
      });
      await repo.saveAll(baseState([proj]));

      const changesBefore = count('SELECT COUNT(*) AS c FROM entity_changes');
      const revisionsBefore = count('SELECT COUNT(*) AS c FROM revisions');

      // 内容一致地再存一次：无新修订、无新变更行
      await repo.saveProject(proj);
      expect(count('SELECT COUNT(*) AS c FROM revisions')).toBe(revisionsBefore);
      expect(count('SELECT COUNT(*) AS c FROM entity_changes')).toBe(changesBefore);

      // 只改第一章正文：章节节点数不变，仅新增一条修订，且只针对第一章
      const c2RevisionsBefore = count(`SELECT COUNT(*) AS c FROM revisions WHERE node_id = ?`, ['c2']);
      const edited = project('diff', {
        chapters: [chapter('c1', '第一章', '正文一改'), chapter('c2', '第二章', '正文二')],
        lastModified: 1000,
      });
      await repo.saveProject(edited);
      expect(count("SELECT COUNT(*) AS c FROM nodes WHERE book_id='diff' AND type='novel.chapter'")).toBe(2);
      expect(count('SELECT COUNT(*) AS c FROM revisions')).toBe(revisionsBefore + 1);
      expect(rawGet<{ body: string }>(`SELECT body FROM nodes WHERE id = ?`, ['c1'])!.body).toBe('正文一改');
      expect(count(`SELECT COUNT(*) AS c FROM revisions WHERE node_id = ?`, ['c2'])).toBe(c2RevisionsBefore);
    });

    it('deleteProject 删除项目及其 FTS 索引', async () => {
      await repo.saveAll(baseState([
        project('a', { chapters: [chapter('c1', '第一章', '龙骑士闯入了古城堡')] }),
      ]));
      expect((await repo.search('古城堡')).length).toBeGreaterThan(0);

      await repo.deleteProject('a');
      expect((await repo.loadAll())!.projects).toHaveLength(0);
      expect(await repo.search('古城堡')).toHaveLength(0); // FTS 已随项目清除
    });

    it('saveSettings 只写给定切片，保留其它', async () => {
      await repo.saveAll(baseState([project('a')]));
      await repo.saveSettings({ activeModelId: 'm2', models: [{ id: 'm2', name: '新模型' } as never] });

      const loaded = await repo.loadAll();
      expect(loaded!.activeModelId).toBe('m2');
      expect(loaded!.models[0]!.id).toBe('m2');
      expect(loaded!.projects.map(p => p.id)).toEqual(['a']); // 项目未受影响
    });

    it('language 经 meta 往返持久化', async () => {
      await repo.saveAll(baseState([project('a')]));
      expect((await repo.loadAll())!.language).toBeUndefined(); // 默认跟随检测
      await repo.saveSettings({ language: 'en' });
      expect((await repo.loadAll())!.language).toBe('en');
      await repo.saveSettings({ language: 'zh' });
      expect((await repo.loadAll())!.language).toBe('zh');
    });

    it('FTS5 trigram 支持中文正文子串检索并返回片段', async () => {
      await repo.saveAll(baseState([
        project('a', {
          chapters: [
            chapter('c1', '第一章', '少年在雨夜中拔出了那把沉睡千年的剑'),
            chapter('c2', '第二章', '城堡的大门缓缓打开'),
          ],
          knowledge: [knowledge('k1', '世界观设定：魔法源自星辰之力')],
        }),
      ]));

      const hits = await repo.search('沉睡千年的剑');
      expect(hits.length).toBe(1);
      expect(hits[0]!.scope).toBe('chapter');
      expect(hits[0]!.id).toBe('c1');
      expect(hits[0]!.snippet).toContain('剑');

      const kn = await repo.search('星辰之力');
      expect(kn.length).toBe(1);
      expect(kn[0]!.scope).toBe('knowledge');
      expect(kn[0]!.id).toBe('k1');
    });

    it('FTS5 可按知识库条目的 name 命中（name 与 content 同索引）', async () => {
      await repo.saveAll(baseState([
        project('a', {
          knowledge: [knowledge('k9', '这是一段与标题无关的正文描述内容', '魔法体系设定')],
        }),
      ]));
      const hits = await repo.search('魔法体系');
      expect(hits.length).toBe(1);
      expect(hits[0]!.scope).toBe('knowledge');
      expect(hits[0]!.id).toBe('k9');
      expect(hits[0]!.title).toBe('魔法体系设定'); // name 回传
    });

    it('search 可按 projectId 限定范围', async () => {
      await repo.saveAll(baseState([
        project('a', { chapters: [chapter('c1', 't', '魔法学院的入学典礼')] }),
        project('b', { chapters: [chapter('c2', 't', '魔法学院的毕业典礼')] }),
      ]));
      const all = await repo.search('魔法学院');
      expect(all.length).toBe(2);
      const onlyA = await repo.search('魔法学院', { projectId: 'a' });
      expect(onlyA.length).toBe(1);
      expect(onlyA[0]!.projectId).toBe('a');
    });

    it('短于 3 字符的查询返回空（trigram 约束）', async () => {
      await repo.saveAll(baseState([project('a', { chapters: [chapter('c1', 't', '剑与魔法')] })]));
      expect(await repo.search('剑')).toHaveLength(0);
    });

    it('clear 清空数据但保留 schema', async () => {
      await repo.saveAll(baseState([project('a')]));
      await repo.clear();
      expect(await repo.loadAll()).toBeNull();
      const row = rawGet<{ value: string }>(`SELECT value FROM meta WHERE key='schema_version'`);
      expect(Number(row!.value)).toBe(SCHEMA_VERSION);
    });

    it('一致性配置从 settings 表读取', async () => {
      await repo.saveAll(baseState([]));
      expect(await repo.loadConsistencyCheckConfig()).toBeNull();
      await repo.saveSettings({ consistencyCheckConfig: { mode: 'vector' } as never });
      expect(await repo.loadConsistencyCheckConfig()).toEqual({ mode: 'vector' });
    });

    it('saveProject 为实体写 entity_changes（agentId=user，含 instanceId）', async () => {
      await repo.saveProject(project('a', { chapters: [chapter('c1', '第一章', '正文')] }));
      const changes = rawAll<{ entity_name: string; agent_id: string; instance_id: string; is_erased: number }>(
        `SELECT entity_name, agent_id, instance_id, is_erased FROM entity_changes`
      );
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.every((c) => c.agent_id === 'user' && c.instance_id.length > 0 && c.is_erased === 0)).toBe(true);
      expect(changes.some((c) => c.entity_name === 'nodes')).toBe(true);
    });

    it('内容未变时重复 saveProject 不产生新变更（哈希差分）', async () => {
      const p = project('a', { chapters: [chapter('c1', '第一章', '正文')] });
      await repo.saveProject(p);
      const before = rawAll<{ n: number }>(`SELECT COUNT(*) AS n FROM entity_changes`)[0]!.n;
      await repo.saveProject(p); // 同一内容再存
      const after = rawAll<{ n: number }>(`SELECT COUNT(*) AS n FROM entity_changes`)[0]!.n;
      expect(after).toBe(before);
    });

    it('改正文 → 仅变化实体写新变更；删项目 → 写擦除变更', async () => {
      await repo.saveProject(project('a', { chapters: [chapter('c1', '第一章', '旧文'), chapter('c2', '第二章', '不变')] }));
      const before = rawAll<{ n: number }>(`SELECT COUNT(*) AS n FROM entity_changes`)[0]!.n;
      await repo.saveProject(project('a', { chapters: [chapter('c1', '第一章', '新文'), chapter('c2', '第二章', '不变')] }));
      const after = rawAll<{ n: number }>(`SELECT COUNT(*) AS n FROM entity_changes`)[0]!.n;
      expect(after).toBeGreaterThan(before);
      // 擦除变更：删除整本书
      await repo.deleteProject('a');
      const erased = rawAll<{ n: number }>(`SELECT COUNT(*) AS n FROM entity_changes WHERE is_erased = 1`)[0]!.n;
      expect(erased).toBeGreaterThan(0);
    });

    it('saveProject 提交后派生索引被填充（卡片隐式标签 + 伏笔）', async () => {
      await repo.saveProject(project('idx1', {
        characters: [{ id: 'card-lin', name: '林渊' } as never],
        chapters: [chapter('c1', '第一章', '他走进了[[林渊]]的房间。')],
        foreshadows: [{ id: 'fs1', title: '玉佩', status: 'planted', importance: 'critical' } as never],
      }));
      const snap = indexService.get('idx1');
      expect(snap).toBeTruthy();
      expect(snap!.tags.get('林渊')?.nodeId).toBe('card-lin');
      expect(snap!.hardLinks.get('c1')).toContain('card-lin');
      expect(snap!.foreshadowOpen.some((f) => f.nodeId === 'fs1')).toBe(true);
    });

    it('loadAll 冷启动从持久实体重建派生索引', async () => {
      await repo.saveProject(project('idx2', { characters: [{ id: 'c1', name: '苏墨' } as never] }));
      indexService.clear(); // 模拟进程重启：内存缓存丢失，实体仍在库
      await repo.loadAll();
      expect(indexService.get('idx2')?.tags.get('苏墨')?.nodeId).toBe('c1');
    });

    it('deleteProject 后派生索引失效', async () => {
      await repo.saveProject(project('idx3', { characters: [{ id: 'c1', name: '甲' } as never] }));
      expect(indexService.get('idx3')).toBeTruthy();
      await repo.deleteProject('idx3');
      expect(indexService.get('idx3')).toBeUndefined();
    });

    it('正文实质变化才追加修订；未变不追加；编辑续号', async () => {
      await repo.saveProject(project('rev1', { chapters: [chapter('c1', '第一章', '初稿内容')] }));
      let revs = (await repo.loadRevisions('c1'));
      expect(revs).toHaveLength(1);
      expect(revs[0]).toMatchObject({ seq: 1, body: '初稿内容', author: 'user' });

      // 相同正文再存 → 不产生新修订
      await repo.saveProject(project('rev1', { chapters: [chapter('c1', '第一章', '初稿内容')] }));
      revs = (await repo.loadRevisions('c1'));
      expect(revs).toHaveLength(1);

      // 改正文 → seq 2
      await repo.saveProject(project('rev1', { chapters: [chapter('c1', '第一章', '改后内容')] }));
      revs = (await repo.loadRevisions('c1'));
      expect(revs.map((r) => r.seq)).toEqual([1, 2]);
      expect(revs[1]?.body).toBe('改后内容');
    });

    it('AI 提交记录 agentId 与 cause（单一事务管线留底）', async () => {
      await repo.saveProject(
        project('rev2', { chapters: [chapter('c1', '第一章', 'AI 续写')] }),
        { agentId: 'ai:continue', cause: 'toolcall-42' }
      );
      const revs = (await repo.loadRevisions('c1'));
      expect(revs[0]).toMatchObject({ author: 'ai:continue', cause: 'toolcall-42' });
      // entity_changes 也带同一 agentId
      const chg = rawAll<{ agent_id: string }>(`SELECT agent_id FROM entity_changes WHERE entity_id='c1'`);
      expect(chg.some((c) => c.agent_id === 'ai:continue')).toBe(true);
    });

    it('空正文节点不产生修订噪声', async () => {
      await repo.saveProject(project('rev3', { chapters: [chapter('c1', '第一章', '')] }));
      expect((await repo.loadRevisions('c1'))).toHaveLength(0);
    });

    it('文档附件：保存 → 列出 → 读回字节 → 删除（元数据与二进制分表）', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const saved = await repo.saveAttachment({ nodeId: 'book-1', role: 'document', mime: 'text/plain', name: 'note.txt', bytes });
      expect(saved.size).toBe(5);
      expect(saved.name).toBe('note.txt');

      const list = await repo.listAttachments('book-1');
      expect(list.map((item) => item.name)).toEqual(['note.txt']);
      expect(list.map((item) => item.nodeId)).toEqual(['book-1']);

      const back = await repo.loadAttachmentBytes(saved.id);
      expect(back).not.toBeNull();
      expect(Array.from(back!)).toEqual([1, 2, 3, 4, 5]);

      await repo.deleteAttachment(saved.id);
      expect(await repo.listAttachments('book-1')).toHaveLength(0);
      expect(await repo.loadAttachmentBytes(saved.id)).toBeNull();
    });

    it('通用模型：内置实体类型与字段幂等写入', async () => {
      await ensureBuiltinItemTypes(repo);
      await ensureBuiltinItemTypes(repo);
      const types = await repo.listItemTypes();
      expect(types.length).toBe(BUILTIN_ITEM_TYPES.length);
      expect(types.every((item) => item.builtin)).toBe(true);
      expect(types.some((item) => item.id === 'builtin:novel.character')).toBe(true);

      const fields = await repo.listFields('builtin:novel.event');
      expect(fields.map((f) => f.key)).toEqual(['storyTime', 'importance', 'duration']);
      const importance = fields.find((f) => f.key === 'importance')!;
      expect(importance.options).toEqual(['major', 'minor']);
      expect(importance.dataType).toBe('option');
    });

    it('通用模型：自定义类型/字段/视图/顺序往返', async () => {
      await repo.saveItemType({ id: 'user:spell', workId: 'w1', label: '法术', builtin: false, color: '#ff0000' });
      await repo.saveField({
        id: 'user:spell.level', itemTypeId: 'user:spell', key: 'level', label: '阶位', dataType: 'number', required: true, orderIndex: 0,
      });
      const types = await repo.listItemTypes('w1');
      expect(types.some((item) => item.id === 'user:spell')).toBe(true);
      const fields = await repo.listFields('user:spell');
      expect(fields).toHaveLength(1);
      expect(fields[0]).toMatchObject({ key: 'level', required: true });

      await repo.saveView({ id: 'v1', workId: 'w1', name: '时间线', viewType: 'timeline', config: { sort: 'storyTime', reversed: false }, orderIndex: 0 });
      const views = await repo.listViews('w1');
      expect(views).toHaveLength(1);
      expect(views[0]!.viewType).toBe('timeline');
      expect(views[0]!.config).toEqual({ sort: 'storyTime', reversed: false });

      await repo.saveSequence('w1', [
        { id: 's1', workId: 'w1', nodeId: 'c1', parentId: null, orderIndex: 99 },
        { id: 's2', workId: 'w1', nodeId: 'c2', parentId: 'c1', orderIndex: 99 },
      ]);
      const seq = await repo.listSequence('w1');
      expect(seq.map((item) => item.nodeId)).toEqual(['c1', 'c2']);
      expect(seq.map((item) => item.orderIndex)).toEqual([0, 1]);

      // 覆盖写入：先删后插
      await repo.saveSequence('w1', [{ id: 's3', workId: 'w1', nodeId: 'c3', parentId: null, orderIndex: 0 }]);
      expect((await repo.listSequence('w1')).map((item) => item.nodeId)).toEqual(['c3']);

      await repo.deleteView('v1');
      expect(await repo.listViews('w1')).toHaveLength(0);
    });

    it('通用模型：clear 清空类型/字段/顺序/视图', async () => {
      await ensureBuiltinItemTypes(repo);
      await repo.saveView({ id: 'v1', workId: 'w1', name: 'x', viewType: 'table', config: {}, orderIndex: 0 });
      await repo.saveSequence('w1', [{ id: 's1', workId: 'w1', nodeId: 'c1', parentId: null, orderIndex: 0 }]);
      await repo.clear();
      expect(await repo.listItemTypes()).toHaveLength(0);
      expect(await repo.listViews('w1')).toHaveLength(0);
      expect(await repo.listSequence('w1')).toHaveLength(0);
    });
  });
}
