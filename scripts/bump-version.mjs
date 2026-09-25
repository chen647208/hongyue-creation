/*
 * 发版脚本：单一入口改版本号，影响所有地方。
 * 用法：node scripts/bump-version.mjs 1.0.1 --zh "中文说明" --en "English notes"
 * 效果：package.json → releases.ts 顶部追加 → CHANGELOG.md 顶部追加。
 * 配合 git tag v<version> 由调用方决定。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const next = process.argv[2];
const zh = arg('--zh') ?? '';
const en = arg('--en') ?? '';
if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('用法：node scripts/bump-version.mjs <x.y.z> --zh "说明" --en "notes"');
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);

// 1. package.json
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

// 2. releases.ts 顶部追加
const relPath = path.join(root, 'src/renderer/features/version/releases.ts');
let rel = readFileSync(relPath, 'utf-8');
const entry = `  {\n    version: '${next}',\n    date: '${today}',\n    description: {\n      zh: '${zh.replaceAll("'", "\\'")}',\n      en: '${en.replaceAll("'", "\\'")}',\n    },\n  },\n`;
rel = rel.replace('export const RELEASES: ReleaseEntry[] = [\n', `export const RELEASES: ReleaseEntry[] = [\n${entry}`);
writeFileSync(relPath, rel);

// 3. CHANGELOG.md：在 [Unreleased] 之后、最早已发布版本之前插入
const clPath = path.join(root, 'CHANGELOG.md');
let cl;
try { cl = readFileSync(clPath, 'utf-8'); } catch { cl = '# 更新日志 (Changelog)\n'; }
const block = `## [${next}] - ${today}\n\n### 新增\n- ${zh || en || 'release'}\n\n`;
if (!cl.includes(`## [${next}]`)) {
  const unreleased = cl.search(/^## \[Unreleased\]/m);
  if (unreleased >= 0) {
    // [Unreleased] 区块末尾：其后首个 `## [` 标题之前；没有则追加到文件末尾前
    const afterUnreleased = cl.slice(unreleased);
    const nextHeading = afterUnreleased.search(/\n## \[[^\]]+\]/);
    const insertAt = nextHeading >= 0 ? unreleased + nextHeading + 1 : cl.length;
    cl = `${cl.slice(0, insertAt)}${block}${cl.slice(insertAt)}`;
  } else {
    // 无 [Unreleased]：preamble 之后（首个 `## [` 之前）
    const firstSection = cl.search(/^## \[/m);
    cl = firstSection >= 0 ? `${cl.slice(0, firstSection)}${block}${cl.slice(firstSection)}` : `${cl}\n${block}`;
  }
  writeFileSync(clPath, cl);
}

console.log(`bumped to ${next}`);
