#!/usr/bin/env node
/**
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 密钥扫描（零命中门禁）：本地 verify 与 CI 跑同一脚本，门禁集合一致。
 * 用法：node scripts/scan-secrets.mjs（命中则输出位置并退出码 1）
 * 说明：只扫工作区文本；package-lock.json 排除（内含哈希与假 key 测试向量）。
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERN = 'sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY|xox[bap]-';
const re = new RegExp(PATTERN);
const hits = [];

// 已跟踪文件：git grep（尊重 .gitignore，排除 lock）
try {
  const out = execFileSync('git', ['grep', '-nE', PATTERN, '--', '.', ':!package-lock.json'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (out.trim()) hits.push(out.trim());
} catch (err) {
  if (err.stdout?.trim()) hits.push(err.stdout.trim());
}

// 未跟踪的新文件：git grep 看不见，逐个读内容匹配（密钥恰恰最可能藏在这里）
const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf-8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);
for (const f of untracked) {
  if (f === 'package-lock.json') continue;
  let content;
  try {
    content = readFileSync(f, 'utf-8');
  } catch {
    continue; // 二进制/不可读跳过
  }
  content.split('\n').forEach((line, i) => {
    if (re.test(line)) hits.push(`${f}:${i + 1}:${line.trim().slice(0, 80)}`);
  });
}

if (hits.length > 0) {
  console.error('密钥扫描命中（须清零后提交）：\n' + hits.join('\n'));
  process.exit(1);
}
console.log('密钥扫描通过：零命中。');
