#!/usr/bin/env node
/**
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 用既有 esbuild 依赖把 `src/renderer/sw.ts` 编译为 `build/renderer/sw.js`，
 * 并把 package.json 的版本号注入缓存名（部署新版即换缓存）。
 *
 * 用法：npm run build 之后自动执行；单独执行前需先有 build/renderer 目录。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'build', 'renderer');

if (!existsSync(outDir)) {
  console.error('build/renderer 不存在，请先运行 vite build。');
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

await build({
  entryPoints: [join(root, 'src', 'renderer', 'sw.ts')],
  outfile: join(outDir, 'sw.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  define: { __SW_VERSION__: JSON.stringify(packageJson.version) },
  logLevel: 'info',
});

console.log(`service worker 已写入 ${join(outDir, 'sw.js')}（缓存版本 ${packageJson.version}）`);
