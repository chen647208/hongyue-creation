#!/usr/bin/env node
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 大书规模性能基线（默认 1000 章 × 约 1 万字/章，合计约 1000 万字）。
 *
 * 运行：`npm run perf:large-book`
 * 环境变量：
 *   PERF_SIZES=100,250,500,1000  逐档章数（每档独立建库，用于观察增长曲线）
 *   PERF_CHAPTER_CHARS=10000     每章正文字符数
 *   PERF_EDIT_RUNS=2             单章修改落盘的采样次数（取最后一次，规避 JIT 冷启动）
 *   PERF_PROFILE=1               打出每个阶段内的 SQL 语句耗时排行
 *
 * 测的是哪一段（全部在 node 下真实执行，不依赖 Electron 渲染层）：
 *   1. 合成 Project（内存）与 projectToEntities 投影；
 *   2. AppState 整体 JSON 序列化/反序列化（JSON 后端每次写都是“读-改-写整份”）；
 *   3. computePersistDiff（纯函数，引用 + 配置键比较）；
 *   4. SqliteRepository.saveAll（首帧全量落盘，首次导入/首帧持久化走这条）、
 *      saveProject（改一章后的增量落盘）、loadAll（冷启动）、loadBookContent（打开一本书）；
 *   5. buildIndex（改一章后 saveProject 内部必做的整书索引重建）；
 *   6. 磁盘产物：SQLite 主库 + WAL 体积。
 *
 * 刻意没测：Electron IPC 往返、渲染层 React 渲染、FTS 检索延迟（只测建索引）、
 * 自动备份与导出、多本书并存的交叉影响。
 *
 * 基线数字（2026-11-22，Windows 10 / Node 24.11 / better-sqlite3 3.53.4，
 * 1000 章 × 1 万字；同机多次运行取值区间）：
 *   - 首帧全量落盘 saveAll：约 9～15 秒（1000 章）—— 见下方“已知问题”；
 *   - 改一章落盘 saveProject：0.65～0.87 秒（1000 章），100 章约 0.06～0.09 秒，近似线性；
 *   - 冷启动 loadAll：0.57～0.66 秒；打开本书 loadBookContent：0.16～0.20 秒；
 *   - 改一章时 computePersistDiff：0.0～0.1 毫秒（书级引用比较，与章数无关）；
 *   - JSON 后端整份序列化：28.8 MB / 约 28～37 毫秒（1000 万字）；
 *   - SQLite 库体积：100.6 MB；JSON 快照体积：28.8 MB。
 *
 * 已知问题（本脚本发现的唯一二次方，尚未修）：
 *   首帧全量落盘是 O(章数²)。根因在 nodes_fts：node_id 列是 UNINDEXED，
 *   `DELETE FROM nodes_fts WHERE node_id = ?` 只能全表扫描，FTS5 还要为扫到的行
 *   重新分词；saveAll 对每个节点先删后插一次，合计 N 次全表扫描。
 *   隔离验证（只跑这两条语句，file + WAL + FULL，正文 1 万字）：100 行约 0.06 秒、
 *   500 行约 0.45 秒、1000 行约 7.8 秒（机器空闲时；负载高时数值成倍上浮，
 *   但增长形状不变）。1000 章整书首写因此约 9～15 秒。
 *   日常改一章只删一行，仍在 1 秒内，不受这条影响。
 *
 * 怎么判断：看“每章成本”那一栏是否随规模持平。
 *   持平 = 线性；明显上升 = 有随书规模膨胀的二次方或高常数项。
 *   末尾按 1.5 倍阈值自动标注“超线性”。绝对值受磁盘 fsync 与机器负载抖动影响，
 *   只看同一台机器、同一组环境变量下的前后对比；连续跑两三次取稳定值。
 *
 * 数据全部在内存与系统临时目录，结束即删除；不进入 CI 门禁（不在 verify 链内）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Database from 'better-sqlite3-multiple-ciphers';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SIZES = (process.env.PERF_SIZES ?? '100,250,500,1000')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const CHAPTER_CHARS = Number(process.env.PERF_CHAPTER_CHARS ?? 10000);
const EDIT_RUNS = Math.max(1, Number(process.env.PERF_EDIT_RUNS ?? 2));
/** 合成正文的重复种子：约 240 字，贴近中文小说的字符构成。 */
const SEED_TEXT =
  '夜色压着山脊，风从隘口灌下来。沈归舟把灯芯拨亮，纸窗上映出两道人影。' +
  '他听见院外的脚步停在门前，没有敲门，也没有离开。桌上那封没有署名的信被风掀开一角，' +
  '露出半行小字：三更之前，别回头。远处更夫的梆子敲过两响，狗吠声从巷尾一路追到巷口。';

const nowMs = () => Number(process.hrtime.bigint()) / 1e6;

function timed(fn) {
  const t0 = nowMs();
  const result = fn();
  return { ms: nowMs() - t0, result };
}

async function timedAsync(fn) {
  const t0 = nowMs();
  const result = await fn();
  return { ms: nowMs() - t0, result };
}

function gc() {
  if (typeof global.gc === 'function') global.gc();
}

/** 采样点内存（同步阶段内部无法插桩，这里只取阶段结束点）。 */
function mem() {
  const m = process.memoryUsage();
  return { heap: m.heapUsed, rss: m.rss };
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
const ms = (n) => n.toFixed(1);

function makeBody(index, chars) {
  const prefix = `第 ${index + 1} 章 风起\n`;
  const rest = Math.max(0, chars - prefix.length);
  const repeated = SEED_TEXT.repeat(Math.ceil(rest / SEED_TEXT.length)).slice(0, rest);
  return prefix + repeated;
}

function makeProject(chapterCount, charsPerChapter) {
  const chapters = [];
  for (let i = 0; i < chapterCount; i += 1) {
    chapters.push({
      id: `ch${String(i + 1).padStart(4, '0')}`,
      title: `第 ${i + 1} 章 风起`,
      summary: `第 ${i + 1} 章的细纲：主角追查失踪的信使，线索指向北境。`,
      content: makeBody(i, charsPerChapter),
      order: i,
      status: 'done',
    });
  }
  return {
    id: 'book-large',
    title: '大书性能基线',
    inspiration: '合成数据，仅用于性能基线。',
    intro: '1000 章规模。',
    characters: [],
    outline: '',
    chapters,
    virtualChapters: [],
    knowledge: [],
    lastModified: Date.now(),
  };
}

function makeState(project) {
  return {
    schemaVersion: 1,
    projects: [project],
    activeProjectId: project.id,
    providers: [],
    models: [],
    prompts: [],
    activeModelId: null,
    embeddingModels: [],
    activeEmbeddingModelId: null,
  };
}

/** 改一章：只替换该章对象与书对象引用（与 UI 的不可变更新同形）。 */
function editChapter(project, chapterIndex, iteration) {
  const chapters = project.chapters.slice();
  const target = chapters[chapterIndex];
  chapters[chapterIndex] = {
    ...target,
    content: `${target.content}\n（第 ${iteration} 次修订补写）`,
  };
  return { ...project, chapters, lastModified: project.lastModified + 1 };
}

/** better-sqlite3 上的 file 版 SqlDriver：按 catalog id 取语句，与桌面主进程同构。 */
function makeDriver(db, SQL, profileEnabled = false) {
  let profileOn = profileEnabled;
  let profile = new Map();
  const add = (id, ms) => {
    if (!profileOn) return;
    const row = profile.get(id) ?? { calls: 0, ms: 0 };
    row.calls += 1;
    row.ms += ms;
    profile.set(id, row);
  };
  const driver = {
    async exec(id) {
      const t0 = nowMs();
      db.exec(SQL[id]);
      add(id, nowMs() - t0);
    },
    async run(id, params = []) {
      const t0 = nowMs();
      const info = db.prepare(SQL[id]).run(...params);
      add(id, nowMs() - t0);
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    },
    async all(id, params = []) {
      const t0 = nowMs();
      const rows = db.prepare(SQL[id]).all(...params);
      add(id, nowMs() - t0);
      return rows;
    },
    async get(id, params = []) {
      const t0 = nowMs();
      const row = db.prepare(SQL[id]).get(...params);
      add(id, nowMs() - t0);
      return row;
    },
    async transaction(fn) {
      db.exec('BEGIN');
      try {
        const result = await fn(driver);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  driver.profile = () => [...profile.entries()].sort((a, b) => b[1].ms - a[1].ms);
  /** 只对某一段开启统计，避免不同阶段的调用混在一起。 */
  driver.withProfile = async (fn) => {
    profile = new Map();
    profileOn = true;
    try {
      return await fn();
    } finally {
      profileOn = false;
    }
  };
  return driver;
}

async function loadModules() {
  const cacheDir = path.join(ROOT, 'node_modules/.cache/hongyue-perf');
  fs.mkdirSync(cacheDir, { recursive: true });
  const bundlePath = path.join(cacheDir, 'large-book.mjs');
  const entry = `
    export { SqliteRepository } from './src/renderer/shared/services/repository/sqliteRepository.ts';
    export { computePersistDiff } from './src/renderer/app/persistDiff.ts';
    export { projectToEntities } from './src/core/project/bridge.ts';
    export { buildIndex } from './src/core/index/indexer.ts';
    export { SQL } from './src/shared/sql/catalog.ts';
  `;
  await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundlePath,
    define: { 'import.meta.env.DEV': 'false' },
    alias: {
      '@': path.join(ROOT, 'src/renderer'),
      '@core': path.join(ROOT, 'src/core'),
      '@shared': path.join(ROOT, 'src/shared'),
      '@assets': path.join(ROOT, 'src/assets'),
    },
    external: ['better-sqlite3-multiple-ciphers', 'electron'],
    logLevel: 'warning',
  });
  return import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`);
}

/**
 * 隔离验证：只跑 saveAll/saveProject 里对 nodes_fts 的那两条语句，其余全部剔除。
 * 设置与生产一致：file + WAL + synchronous=FULL、正文长度同 CHAPTER_CHARS、
 * 每个节点先删后插、全部在单事务内。
 *
 * node_id 是 UNINDEXED，`DELETE ... WHERE node_id = ?` 只能全表扫描；
 * FTS5 还要为命中的行重新分词，扫描成本随全表内容体积（行数 × 每行字数）增长。
 */
function ftsWriteScaling(rowCount) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hongyue-perf-fts-'));
  const db = new Database(path.join(dir, 'fts.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('busy_timeout = 5000');
  db.pragma('wal_autocheckpoint = 1000');
  db.exec(SQL_DDL_FTS);
  const insert = db.prepare('INSERT INTO nodes_fts(book_id, node_id, type, title, content) VALUES(?,?,?,?,?)');
  const del = db.prepare('DELETE FROM nodes_fts WHERE node_id = ?');
  const body = makeBody(0, CHAPTER_CHARS);
  const t0 = nowMs();
  try {
    db.exec('BEGIN');
    for (let i = 0; i < rowCount; i += 1) {
      del.run(`n${i}`);
      insert.run('b', `n${i}`, 'novel.chapter', `第 ${i} 章`, body);
    }
    db.exec('COMMIT');
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const totalMs = nowMs() - t0;
  return { rowCount, totalMs, perCallMs: totalMs / rowCount };
}

/** 与 shared/sql/catalog.ts 的 migration.v2.nodesFts 同形（UNINDEXED 是问题根因）。 */
const SQL_DDL_FTS = `CREATE VIRTUAL TABLE nodes_fts USING fts5(
  book_id UNINDEXED, node_id UNINDEXED, type UNINDEXED, title, content, tokenize = 'trigram'
)`;

function dirBytes(files) {
  let total = 0;
  for (const file of files) {
    try {
      total += fs.statSync(file).size;
    } catch {
      /* WAL 可能已被 checkpoint 清空或删除 */
    }
  }
  return total;
}

async function runSize(size, mod) {
  const { SqliteRepository, computePersistDiff, projectToEntities, buildIndex, SQL } = mod;
  gc();
  const baseline = mem();
  let peakHeap = baseline.heap;
  let peakRss = baseline.rss;
  const sample = () => {
    const m = mem();
    peakHeap = Math.max(peakHeap, m.heap);
    peakRss = Math.max(peakRss, m.rss);
  };

  // 1. 合成 Project
  const gen = timed(() => makeProject(size, CHAPTER_CHARS));
  const project = gen.result;
  sample();

  // 2. 投影
  const proj = timed(() => projectToEntities(project));
  const entities = proj.result;
  sample();

  // 3. JSON 后端整份读写（jsonRepository.saveProject 的等价代价）
  const state = makeState(project);
  const ser = timed(() => JSON.stringify(state));
  const jsonText = ser.result;
  sample();
  const parse = timed(() => JSON.parse(jsonText));

  // 4. 差分计算：改一章 vs 全部项目引用替换
  const edited = editChapter(project, Math.floor(size / 2), 0);
  const nextState = makeState(edited);
  const diffEdit = timed(() => computePersistDiff(state, nextState));
  const allChangedState = makeState({ ...project, lastModified: project.lastModified + 2 });
  const diffAll = timed(() => computePersistDiff(state, allChangedState));

  // 5. 索引重建（saveProject 内部每次都要跑）
  const indexBuild = timed(() => buildIndex(entities));
  sample();

  // 6. SQLite：首帧全量落盘 + 改一章 + 冷启动 + 打开书
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hongyue-perf-'));
  const dbPath = path.join(dir, 'perf.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('busy_timeout = 5000');
  db.pragma('wal_autocheckpoint = 1000');
  const profileEnabled = process.env.PERF_PROFILE === '1';
  const driver = makeDriver(db, SQL, profileEnabled);
  const repo = new SqliteRepository(driver);

  let saveAllResult;
  let saveAllProfile;
  let saveEditMs;
  let saveEditRuns;
  let saveEditProfile;
  let loadAll;
  let loadBook;
  let dbBytes;
  let counts;
  try {
    saveAllResult = await timedAsync(() => driver.withProfile(() => repo.saveAll(state)));
    saveAllProfile = driver.profile();
    sample();

    // 改一章：采样多次，取最后一次（JIT 预热后）
    let current = edited;
    saveEditMs = 0;
    saveEditRuns = [];
    saveEditProfile = [];
    for (let run = 0; run < EDIT_RUNS; run += 1) {
      if (run > 0) current = editChapter(current, Math.floor(size / 2), run);
      const op = timedAsync(() => driver.withProfile(() => repo.saveProject(current)));
      saveEditMs = (await op).ms;
      saveEditProfile = driver.profile();
      saveEditRuns.push(saveEditMs);
      sample();
    }

    loadAll = await timedAsync(() => repo.loadAll());
    sample();
    loadBook = await timedAsync(() => repo.loadBookContent(project.id));
    sample();

    db.pragma('wal_checkpoint(TRUNCATE)');
    dbBytes = dirBytes([dbPath, `${dbPath}-wal`, `${dbPath}-shm`]);
    counts = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM nodes) AS nodes,
                (SELECT COUNT(*) FROM revisions) AS revisions,
                (SELECT COUNT(*) FROM attrs) AS attrs,
                (SELECT COUNT(*) FROM edges) AS edges`,
      )
      .get();
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return {
    size,
    chars: size * CHAPTER_CHARS,
    genMs: gen.ms,
    projectMs: proj.ms,
    jsonMs: ser.ms,
    jsonParseMs: parse.ms,
    jsonBytes: Buffer.byteLength(jsonText),
    diffEditMs: diffEdit.ms,
    diffAllMs: diffAll.ms,
    diffOpsEdit: diffEdit.result.length,
    diffOpsAll: diffAll.result.length,
    indexMs: indexBuild.ms,
    saveAllMs: saveAllResult.ms,
    saveEditMs,
    saveEditRuns,
    loadAllMs: loadAll.ms,
    loadBookMs: loadBook.ms,
    dbBytes,
    counts,
    saveAllProfile,
    saveEditProfile,
    peakHeapMB: (peakHeap - baseline.heap) / 1024 / 1024,
    peakRssMB: (peakRss - baseline.rss) / 1024 / 1024,
  };
}

function printTable(rows) {
  const header = [
    '章数',
    '总字数(万)',
    'JSON体积(MB)',
    'DB体积(MB)',
    '生成(ms)',
    '投影(ms)',
    'JSON写(ms)',
    'JSON读(ms)',
    '差分-改一章(ms)',
    '索引重建(ms)',
    '首写全量(ms)',
    '改一章落盘(ms)',
    '冷启动loadAll(ms)',
    '打开本书(ms)',
    '堆峰值(MB)',
  ];
  const lines = [header.join('\t')];
  for (const r of rows) {
    lines.push(
      [
        r.size,
        (r.chars / 10000).toFixed(0),
        mb(r.jsonBytes),
        mb(r.dbBytes),
        ms(r.genMs),
        ms(r.projectMs),
        ms(r.jsonMs),
        ms(r.jsonParseMs),
        ms(r.diffEditMs),
        ms(r.indexMs),
        ms(r.saveAllMs),
        ms(r.saveEditMs),
        ms(r.loadAllMs),
        ms(r.loadBookMs),
        r.peakHeapMB.toFixed(1),
      ].join('\t'),
    );
  }
  console.log('\n' + lines.join('\n') + '\n');
}

/** 每章成本归一化：线性操作该持平；明显上翘即标记超线性。 */
function printScaling(rows) {
  const base = rows[0];
  const basePerChapter = base.saveEditMs / base.size;
  console.log('改一章落盘：每章成本与相对首档的倍数');
  const suspicious = [];
  for (const r of rows) {
    const perChapter = r.saveEditMs / r.size;
    const ratio = perChapter / basePerChapter;
    const flag = ratio > 1.5 ? '  <-- 超线性' : '';
    if (ratio > 1.5) suspicious.push(r.size);
    console.log(
      `  ${String(r.size).padStart(5)} 章  ${perChapter.toFixed(4)} ms/章  相对 ${base.size} 章档 ×${ratio.toFixed(2)}${flag}`,
    );
  }
  if (suspicious.length > 0) {
    console.log(`  结论：改一章落盘存在超线性项（章数 ${suspicious.join(', ')} 档上翘）。`);
  } else {
    console.log('  结论：改一章落盘随章数近似线性，未观察到意外二次方。');
  }

  const basePerChapterAll = base.saveAllMs / base.size;
  console.log('\n首写全量（首次导入/首帧落盘）：每章成本与相对首档的倍数');
  const allFlags = [];
  for (const r of rows) {
    const perChapter = r.saveAllMs / r.size;
    const ratio = perChapter / basePerChapterAll;
    const flag = ratio > 1.5 ? '  <-- 超线性' : '';
    if (ratio > 1.5) allFlags.push(r.size);
    console.log(
      `  ${String(r.size).padStart(5)} 章  ${perChapter.toFixed(4)} ms/章  相对 ${base.size} 章档 ×${ratio.toFixed(2)}${flag}`,
    );
  }
  if (allFlags.length > 0) {
    console.log(
      `  结论：首写全量是二次方。根因见下方隔离验证（nodes_fts 的 node_id 无索引，逐节点删除各扫全表）。`,
    );
  } else {
    console.log('  结论：首写全量随章数近似线性。');
  }
}

async function main() {
  console.log(`\n大书性能基线：章数档 ${SIZES.join(' / ')}，每章 ${CHAPTER_CHARS} 字`);
  const mod = await loadModules();
  const rows = [];
  for (const size of SIZES) {
    process.stdout.write(`运行 ${size} 章... `);
    const row = await runSize(size, mod);
    rows.push(row);
    console.log(`完成（改一章 ${ms(row.saveEditMs)} ms，DB ${mb(row.dbBytes)} MB）`);
    if (process.env.PERF_PROFILE === '1') {
      console.log(`  首写全量 语句耗时前 6（${size} 章）：`);
      for (const [id, stat] of row.saveAllProfile.slice(0, 6)) {
        console.log(`    ${id.padEnd(36)} ${stat.calls.toString().padStart(7)} 次  ${ms(stat.ms).padStart(9)} ms`);
      }
      console.log(`  改一章 语句耗时前 6（${size} 章）：`);
      for (const [id, stat] of row.saveEditProfile.slice(0, 6)) {
        console.log(`    ${id.padEnd(36)} ${stat.calls.toString().padStart(7)} 次  ${ms(stat.ms).padStart(9)} ms`);
      }
    }
  }
  printTable(rows);
  printScaling(rows);

  const largest = rows[rows.length - 1];

  // 2000 行档单是 FTS 写入就要约 59 秒，默认不跑；需要时改这一行。
  const ftsRows = [100, 500, 1000];
  console.log('隔离验证：只跑 nodes_fts 的“先删后插”（file + WAL + FULL，单事务，正文同长）');
  const ftsResults = ftsRows.map((n) => ftsWriteScaling(n));
  for (const r of ftsResults) {
    console.log(
      `  ${String(r.rowCount).padStart(5)} 行  总 ${r.totalMs.toFixed(1).padStart(8)} ms  单次 ${r.perCallMs.toFixed(4)} ms`,
    );
  }
  const first = ftsResults[0];
  const last = ftsResults[ftsResults.length - 1];
  const ftsRowsRatio = last.rowCount / first.rowCount;
  const ftsTimeRatio = last.totalMs / first.totalMs;
  console.log(
    `  行数 ×${ftsRowsRatio.toFixed(0)} → 总耗时 ×${ftsTimeRatio.toFixed(1)}（` +
      (ftsTimeRatio > ftsRowsRatio * 2
        ? '明显超线性：全表扫描叠加重新分词，总成本随行数二次增长）'
        : '近似线性：正文较短时全表扫描的常数项尚未放大）'),
  );

  console.log('\n备注');
  console.log(
    `- 改一章落盘的内部构成：整本节点正文重读 + 全量哈希（saveProject），以及整书索引重建（buildIndex）。`,
  );
  console.log(
    `- 改一章时 computePersistDiff 只产出 ${largest.diffOpsEdit} 条操作（书级引用比较），本身不随章数增长。`,
  );
  console.log(
    `- JSON 后端每写一次要序列化整份状态（本次 ${mb(largest.jsonBytes)} MB），成本随总字数线性增长；SQLite 后端只写变化实体。`,
  );
  console.log(`- 数据库内容：${JSON.stringify(largest.counts)}。修订表按每次正文变化追加，长期编辑会持续增长。`);
  console.log('\n完成。对比改动前后用同一台机器、同一组环境变量重跑。\n');
}

await main();
