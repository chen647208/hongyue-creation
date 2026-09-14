/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 提案 diff：行级前后对比，供审批界面核对。 */

export interface DiffLine {
  op: 'ctx' | 'add' | 'del';
  text: string;
}

/** 行级最小差异：公共前后缀内的行标 ctx，中间区段旧行 del、新行 add。 */
export function diffLines(before: string, after: string): DiffLine[] {
  const beforeLines = before.length > 0 ? before.split('\n') : [];
  const afterLines = after.length > 0 ? after.split('\n') : [];

  let prefix = 0;
  const maxPrefix = Math.min(beforeLines.length, afterLines.length);
  while (prefix < maxPrefix && beforeLines[prefix] === afterLines[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const result: DiffLine[] = [];
  for (let index = 0; index < prefix; index += 1) result.push({ op: 'ctx', text: beforeLines[index] ?? '' });
  for (let index = prefix; index < beforeLines.length - suffix; index += 1) result.push({ op: 'del', text: beforeLines[index] ?? '' });
  for (let index = prefix; index < afterLines.length - suffix; index += 1) result.push({ op: 'add', text: afterLines[index] ?? '' });
  for (let index = beforeLines.length - suffix; index < beforeLines.length; index += 1) result.push({ op: 'ctx', text: beforeLines[index] ?? '' });
  return result;
}
