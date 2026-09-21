/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 把 docs/{design,guides,features} 链入 docs-site/src（VitePress 内容源）。
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

for (const sub of ['design', 'guides', 'features']) {
  const src = join('docs', sub);
  const dst = join('docs-site', 'src', sub);
  if (!existsSync(src)) continue;
  if (existsSync(dst)) rmSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

// 站点首页：VitePress 以 docs-site/src 为内容源，需把首页拷入该目录才会产出根 index.html
const homeSrc = join('docs-site', 'index.md');
const homeDst = join('docs-site', 'src', 'index.md');
if (existsSync(homeSrc)) cpSync(homeSrc, homeDst);

console.log('docs content synced');
