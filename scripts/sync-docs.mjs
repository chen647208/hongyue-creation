/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 把仓库内的文档与站点静态资源同步进 docs-site/src（VitePress 内容源）。
 * docs-site/src 被 .gitignore 忽略：它是构建输入，真源始终在 docs/ 与仓库根。
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 文档目录：整体拷入站点对应路径。 */
for (const sub of ['design', 'guides', 'features']) {
  const src = join('docs', sub);
  const dst = join('docs-site', 'src', sub);
  if (!existsSync(src)) continue;
  if (existsSync(dst)) rmSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

/** 在正文前插入 frontmatter；已有 frontmatter 时原样返回。 */
function withFrontmatter(body, fields) {
  if (body.startsWith('---\n') || body.startsWith('---\r\n')) return body;
  const bom = body.startsWith('\uFEFF') ? '\uFEFF' : '';
  const text = bom ? body.slice(1) : body;
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return `${bom}---\n${lines.join('\n')}\n---\n\n${text}`;
}

/**
 * 使用教程：仓库根的 USER_GUIDE.md / USER_GUIDE_EN.md 是面向使用者的单一真源。
 * 拷入站点时补 frontmatter（侧边栏文案与页面标题由此取值），源文件保持纯 Markdown。
 */
const userGuides = [
  {
    from: 'USER_GUIDE.md',
    to: join('docs-site', 'src', 'guide', 'index.md'),
    fields: { title: '使用教程', description: '从安装到成稿导出的完整操作步骤' },
  },
  {
    from: 'USER_GUIDE_EN.md',
    to: join('docs-site', 'src', 'guide', 'en.md'),
    fields: { title: 'User Guide (EN)', description: 'Complete walkthrough from install to export' },
  },
];

for (const { from, to, fields } of userGuides) {
  if (!existsSync(from)) continue;
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, withFrontmatter(readFileSync(from, 'utf8'), fields));
}

/** 站点静态资源：品牌图标取自应用自身资产，避免第二份 logo。 */
const publicDir = join('docs-site', 'src', 'public');
mkdirSync(publicDir, { recursive: true });
for (const asset of ['logo.svg', 'app-icon.svg']) {
  const src = join('src', 'assets', asset);
  if (existsSync(src)) copyFileSync(src, join(publicDir, asset));
}

/** 站点首页：VitePress 以 docs-site/src 为内容源，需把首页拷入该目录才会产出根 index.html */
const homeSrc = join('docs-site', 'index.md');
const homeDst = join('docs-site', 'src', 'index.md');
if (existsSync(homeSrc)) copyFileSync(homeSrc, homeDst);

console.log('docs content synced');
