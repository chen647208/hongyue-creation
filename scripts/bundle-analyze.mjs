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
 * （见 vite.config.ts 的 bundleStats 插件），结合 build/renderer 下的实际文件大小，
 * 输出每个 chunk 的体积与 top 依赖占比、全量依赖排行、跨 chunk 重复模块，
 * 以及首屏预载产物里是否混入语言语料。
 *
 * `npm run bundle:check` 调用 buildBundleReport 并把报告写入 build/bundle-report.txt；
 * `npm run bundle:analyze` 直接在终端查看同一份报告。
 * 口径：chunk 体积取文件实际字节（minify 后）；依赖占比取 stats 里的模块渲染字节，
 * 只用于比较份额，不当作文件大小；APP 表示仓库源码。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const DEFAULT_STATS = path.resolve(ROOT, 'build/bundle-stats.json');
const DEFAULT_ASSETS = path.resolve(ROOT, 'build/renderer');

const KB = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;
const SHARE = (part, total) => `${total > 0 ? ((part / total) * 100).toFixed(1) : '0.0'}%`;
const toPosix = (value) => value.split(path.sep).join('/');

/** 收集目录下全部 .js/.css 文件。 */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** 源文件 id → 归属：node_modules 依赖取包名（scope 取两段），其余归 APP（仓库源码）。 */
function ownerOf(id) {
  const normalized = id.replace(/\\/g, '/');
  const marker = normalized.lastIndexOf('node_modules/');
  if (marker < 0) return 'APP';
  const segments = normalized.slice(marker + 'node_modules/'.length).split('/');
  return segments[0].startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
}

/** chunk 内包含的语言语料（路径形如 /i18n/locales/zh/common.json）。 */
function languagesOf(chunk) {
  const languages = new Set();
  for (const id of Object.keys(chunk?.modules ?? {})) {
    const match = id.replace(/\\/g, '/').match(/\/i18n\/locales\/([^/]+)\//);
    if (match) languages.add(match[1]);
  }
  return [...languages];
}

/** index.html 里由入口脚本、modulepreload 与样式表构成的首屏集合。 */
function firstScreenRefs(assetsDir) {
  const htmlPath = path.join(assetsDir, 'index.html');
  if (!fs.existsSync(htmlPath)) return [];
  const html = fs.readFileSync(htmlPath, 'utf8');
  return [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)].map((match) => match[1]);
}

/**
 * 生成组成分析报告；stats 缺失时返回 null（调用方决定是否视为错误）。
 */
export function buildBundleReport({ statsPath = DEFAULT_STATS, assetsDir = DEFAULT_ASSETS } = {}) {
  if (!fs.existsSync(statsPath) || !fs.existsSync(assetsDir)) return null;

  const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  const statsChunks = Array.isArray(stats.chunks) ? stats.chunks : [];
  const chunksByFile = new Map(statsChunks.map((chunk) => [toPosix(chunk.fileName), chunk]));

  const jsFiles = [];
  const cssFiles = [];
  for (const file of walk(assetsDir)) {
    const relative = toPosix(path.relative(assetsDir, file));
    const size = fs.statSync(file).size;
    if (file.endsWith('.js')) jsFiles.push({ relative, size, chunk: chunksByFile.get(relative) });
    else cssFiles.push({ relative, size });
  }

  const jsBytes = jsFiles.reduce((sum, file) => sum + file.size, 0);
  const cssBytes = cssFiles.reduce((sum, file) => sum + file.size, 0);
  const withStats = jsFiles.filter((file) => file.chunk).length;

  const grandOwners = new Map();
  let moduleBytes = 0;
  for (const { chunk } of jsFiles) {
    if (!chunk) continue;
    for (const [id, rendered] of Object.entries(chunk.modules ?? {})) {
      const owner = ownerOf(id);
      grandOwners.set(owner, (grandOwners.get(owner) ?? 0) + rendered);
      moduleBytes += rendered;
    }
  }

  const lines = [];
  lines.push(`JS 产物合计 ${KB(jsBytes)}，共 ${jsFiles.length} 个文件（其中 ${withStats} 个有模块级统计，版本 ${stats.version ?? '未知'}）。`);
  lines.push(`CSS 产物合计 ${KB(cssBytes)}，共 ${cssFiles.length} 个文件。`);
  lines.push('');
  lines.push('各 chunk 体积（文件实际大小；占比为 chunk 内模块渲染字节）：');
  for (const file of [...jsFiles].sort((a, b) => b.size - a.size)) {
    lines.push(`  ${KB(file.size).padStart(10)}  ${file.relative}${file.chunk ? '' : '（无模块统计）'}`);
    if (!file.chunk) continue;
    const owners = new Map();
    let chunkModuleBytes = 0;
    for (const [id, rendered] of Object.entries(file.chunk.modules ?? {})) {
      const owner = ownerOf(id);
      owners.set(owner, (owners.get(owner) ?? 0) + rendered);
      chunkModuleBytes += rendered;
    }
    for (const [owner, bytes] of [...owners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      if (bytes < chunkModuleBytes * 0.02) continue;
      lines.push(`    ${KB(bytes).padStart(10)}  ${SHARE(bytes, chunkModuleBytes).padStart(6)}  ${owner}`);
    }
  }

  if (cssFiles.length > 0) {
    lines.push('');
    lines.push('CSS 文件（top 5）：');
    for (const file of [...cssFiles].sort((a, b) => b.size - a.size).slice(0, 5)) {
      lines.push(`  ${KB(file.size).padStart(10)}  ${file.relative}`);
    }
  }

  const topOwners = [...grandOwners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  lines.push('');
  lines.push(`全量依赖排行（top ${topOwners.length}，按模块渲染字节汇总，占模块统计总量）：`);
  for (const [owner, bytes] of topOwners) {
    lines.push(`  ${KB(bytes).padStart(10)}  ${SHARE(bytes, moduleBytes).padStart(6)}  ${owner}`);
  }

  const moduleChunks = new Map();
  for (const chunk of statsChunks) {
    for (const id of Object.keys(chunk.modules ?? {})) {
      const list = moduleChunks.get(id) ?? [];
      list.push(chunk.fileName);
      moduleChunks.set(id, list);
    }
  }
  const duplicated = [...moduleChunks.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);
  if (duplicated.length > 0) {
    lines.push('');
    lines.push('跨 chunk 重复出现的模块（top 10，多为静态/动态 import 混用导致）：');
    for (const [id, list] of duplicated) {
      lines.push(`  ${list.length} 个 chunk  ${id.replace(/\\/g, '/').replace(/^.*\//, '')}  [${list.map((file) => file.replace(/^assets\//, '')).join(', ')}]`);
    }
  }

  const firstScreen = firstScreenRefs(assetsDir);
  if (firstScreen.length > 0) {
    const sizes = new Map(jsFiles.concat(cssFiles).map((file) => [file.relative, file.size]));
    const firstScreenBytes = firstScreen.reduce((sum, file) => sum + (sizes.get(file) ?? 0), 0);
    lines.push('');
    lines.push(`首屏预载产物：${KB(firstScreenBytes)}，${firstScreen.length} 个引用（index.html 的入口脚本、modulepreload 与样式）。`);
    const corpusInFirstScreen = firstScreen
      .map((file) => ({ file, languages: languagesOf(chunksByFile.get(file)) }))
      .filter((entry) => entry.languages.length > 0);
    if (corpusInFirstScreen.length === 0) {
      lines.push('  语言语料 chunk：无（当前语言在启动时按需加载）。');
    } else {
      for (const entry of corpusInFirstScreen) {
        lines.push(`  语言语料 chunk：${entry.file} [${entry.languages.join(', ')}]`);
      }
    }
  }

  return lines.join('\n');
}

/** 直接执行（npm run bundle:analyze）时打印报告。 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = buildBundleReport();
  if (!report) {
    console.error('未找到 build/bundle-stats.json 或 build/renderer，请先运行 npm run electron:build。');
    process.exit(1);
  }
  console.log(report);
}
