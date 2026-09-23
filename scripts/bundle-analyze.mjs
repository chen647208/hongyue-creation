/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 渲染产物体积组成分析：读 vite 构建旁路写出的 build/bundle-stats.json
 * （见 vite.config.ts 的 bundleStats 插件），输出每个 chunk 的体积与 top 依赖占比、
 * 以及全量产物的依赖排行。用于定位预算超标时该拆谁、该懒加载谁。
 *
 * 用法：npm run build 之后执行 npm run bundle:analyze。
 * 口径：只统计 .js chunk（CSS 单列汇总）；「APP」为本仓库源码，
 * 其余为 node_modules 依赖（@scope/name 取两段）；字节为 minify 后大小。
 */
import fs from 'node:fs';
import path from 'node:path';

const STATS = path.resolve(process.cwd(), 'build/bundle-stats.json');

if (!fs.existsSync(STATS)) {
  console.error('未找到 build/bundle-stats.json，请先运行 npm run build（构建期自动生成）。');
  process.exit(1);
}

const stats = JSON.parse(fs.readFileSync(STATS, 'utf8'));
const { chunks } = stats;

const KB = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;
const SHARE = (part, total) => `${((part / total) * 100).toFixed(1)}%`;

/** 源文件 id → 归属：node_modules 依赖取包名（scope 取两段），其余归 APP（仓库源码）。 */
function ownerOf(id) {
  const normalized = id.replace(/\\/g, '/');
  const marker = normalized.lastIndexOf('node_modules/');
  if (marker < 0) return 'APP';
  const segments = normalized.slice(marker + 'node_modules/'.length).split('/');
  return segments[0].startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
}

const rows = [];
const grandTotal = new Map();
let jsBytes = 0;
let chunkCount = 0;

for (const chunk of chunks) {
  if (!chunk.fileName.endsWith('.js')) continue;
  const owners = new Map();
  let size = 0;
  for (const [id, rendered] of Object.entries(chunk.modules)) {
    const owner = ownerOf(id);
    owners.set(owner, (owners.get(owner) ?? 0) + rendered);
    grandTotal.set(owner, (grandTotal.get(owner) ?? 0) + rendered);
    size += rendered;
  }
  jsBytes += size;
  chunkCount += 1;
  rows.push({ name: chunk.fileName.replace(/^assets\//, ''), size, owners: [...owners.entries()] });
}

rows.sort((a, b) => b.size - a.size);

console.log(`JS 产物合计 ${KB(jsBytes)}，共 ${chunkCount} 个 chunk（build/bundle-stats.json，版本 ${stats.version}）。`);
console.log('');
console.log('各 chunk 体积（含 top 依赖占比，APP = 仓库源码）：');
for (const row of rows) {
  console.log(`  ${KB(row.size).padStart(10)}  ${row.name}`);
  for (const [owner, bytes] of row.owners.sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    if (bytes < row.size * 0.02) continue;
    console.log(`    ${KB(bytes).padStart(10)}  ${SHARE(bytes, row.size).padStart(6)}  ${owner}`);
  }
}

const totalOwners = [...grandTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log('');
console.log(`全量依赖排行（top ${totalOwners.length}，按 chunk 内渲染字节汇总）：`);
for (const [owner, bytes] of totalOwners) {
  console.log(`  ${KB(bytes).padStart(10)}  ${SHARE(bytes, jsBytes).padStart(6)}  ${owner}`);
}

// 同模块落在多个 chunk 即重复加载：跨 chunk 复用时 Rollup 本应单例化，
// 重复往往来自静态 + 动态 import 混用（动态 import 不搬家，见构建告警
// INEFFECTIVE_DYNAMIC_IMPORT），是懒加载改造的定位信号。
const moduleChunks = new Map();
for (const chunk of chunks) {
  for (const id of Object.keys(chunk.modules)) {
    const list = moduleChunks.get(id) ?? [];
    list.push(chunk.fileName);
    moduleChunks.set(id, list);
  }
}
const duplicated = [...moduleChunks.entries()]
  .filter(([, list]) => list.length > 1)
  .map(([id, list]) => ({ id, list }))
  .sort((a, b) => b.list.length - a.list.length)
  .slice(0, 10);
if (duplicated.length > 0) {
  console.log('');
  console.log('跨 chunk 重复出现的模块（top 10，多为静态/动态 import 混用导致）：');
  for (const { id, list } of duplicated) {
    console.log(`  ${list.length} 个 chunk  ${id.replace(/\\/g, '/').replace(/^.*\//, '')}  [${list.map((f) => f.replace(/^assets\//, '')).join(', ')}]`);
  }
}
