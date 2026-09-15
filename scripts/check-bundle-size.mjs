/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 渲染层产物体积预算：统计 build/renderer 下 JS + CSS 总量，超预算即失败。
 * 只算应用代码与样式（排除 wasm / 图标等二进制资源）；预算随功能分期复核，优化后下调。
 */
import fs from 'node:fs';
import path from 'node:path';

/** 预算（KB，当前基线约 3693KB；接入离线壳/分片传输/图表/多会话后复核上调，待按需加载优化后下调）。 */
const BUDGET_KB = 3750;
const DIR = path.resolve(process.cwd(), 'build/renderer');

if (!fs.existsSync(DIR)) {
  console.error(`未找到渲染产物目录 ${path.relative(process.cwd(), DIR)}，请先运行 npm run electron:build。`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(DIR);
const totalKb = files.reduce((sum, f) => sum + fs.statSync(f).size, 0) / 1024;
const rounded = Math.round(totalKb * 10) / 10;

if (totalKb > BUDGET_KB) {
  console.error(`渲染产物体积超预算：${rounded}KB > ${BUDGET_KB}KB。`);
  files
    .map((f) => [path.relative(DIR, f), fs.statSync(f).size / 1024])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([f, kb]) => console.error(`  ${Math.round(kb * 10) / 10}KB  ${f}`));
  process.exit(1);
}
console.log(`渲染产物体积检查通过：${rounded}KB（预算 ${BUDGET_KB}KB）。`);
