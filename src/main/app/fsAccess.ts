/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 文件 IPC 路径门（docs/design/27 §3）：默认只允许 userData 与用户显式授权的根。
 *
 * - 启动加入 userData；自定义数据目录按持久化存储配置在启动时注册（51 篇）；
 * - 系统文件对话框返回的路径自动授权（导入/导出用）；
 * - 越界读写一律拒绝，避免渲染层被控制后读写全盘。
 * - 判定与授权均做 realpath 归一：userData 内指向外部的符号链接不会借道越界。
 */
import fs from 'node:fs';
import path from 'node:path';

const allowedRoots = new Set<string>();

function canonical(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** 授权一个目录（其子树全部放行）。 */
export function allowRoot(dir: string): void {
  allowedRoots.add(canonical(dir));
  allowedRoots.add(path.resolve(dir));
}

/** 授权单个路径（对话框返回的文件/目录）。 */
export function allowPath(target: string): void {
  allowedRoots.add(canonical(target));
  allowedRoots.add(path.resolve(target));
}

/** 路径是否在允许范围内（等于或位于任一授权根之下；符号链接归一到真实路径后判定）。 */
export function isPathAllowed(target: string): boolean {
  const resolved = canonical(target);
  if (allowedRoots.has(resolved)) return true;
  for (const root of allowedRoots) {
    const rel = path.relative(root, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return true;
  }
  return false;
}

export function assertPathAllowed(target: string): void {
  if (!isPathAllowed(target)) {
    throw new Error(`路径不在允许范围：${target}`);
  }
}

/** 测试用：清空授权集合。 */
export function resetAllowedPaths(): void {
  allowedRoots.clear();
}
