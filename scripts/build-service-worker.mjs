#!/usr/bin/env node
/**
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 用既有 esbuild 依赖把 `src/renderer/sw.ts` 编译为 `build/renderer/sw.js`：
 * - 注入 package.json 版本号作缓存名后缀（部署新版即换缓存，activate 时清旧缓存）；
 * - 注入预缓存清单：应用壳 + index.html 引用的全部 assets。
 *
 * 为什么预缓存全部 assets：网络优先策略只回填「SW 已接管后发生的请求」。
 * 首屏的脚本与样式请求发生在 SW 接管之前，不进缓存；断网重载时它们全部
 * ERR_FAILED，应用壳只剩一段空 HTML。所以清单必须在构建期算全，不能等运行时。
 *
 * 用法：npm run build 之后自动执行；单独执行前需先有 build/renderer 目录。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'build', 'renderer');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (!existsSync(outDir)) {
  console.error('build/renderer 不存在，请先运行 vite build。');
  process.exit(1);
}

/** 应用壳：入口、manifest 与图标（assets 之外的静态文件）。 */
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.png', './app-icon.svg'];

/**
 * assets 下的全部产物。体积大头是 wasm（sqlite 约 1.3MB）：一并预缓存，
 * 断网才能真的打开书籍；只预缓存 JS 会让离线壳起得来却读不到数据。
 */
const assetsDir = join(outDir, 'assets');
const assets = existsSync(assetsDir)
  ? readdirSync(assetsDir).map((name) => `./assets/${name}`)
  : [];
const precache = [...SHELL, ...assets];

await build({
  entryPoints: [join(root, 'src', 'renderer', 'sw.ts')],
  outfile: join(outDir, 'sw.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  define: {
    __SW_VERSION__: JSON.stringify(packageJson.version),
    __SW_PRECACHE__: JSON.stringify(precache),
  },
  logLevel: 'info',
});

writeFileSync(join(outDir, 'sw-precache.json'), `${JSON.stringify({ version: packageJson.version, files: precache }, null, 2)}\n`, 'utf8');
console.log(`service worker 已写入 ${join(outDir, 'sw.js')}（缓存版本 ${packageJson.version}，预缓存 ${precache.length} 项）`);
console.log(`预缓存清单 ${relative(root, join(outDir, 'sw-precache.json'))}`);
