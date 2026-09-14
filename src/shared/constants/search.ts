/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 检索最小查询长度：SQLite FTS5 trigram 至少需 3 字符，JSON 后端对齐同一门槛。 */
export const MIN_SEARCH_QUERY_LENGTH = 3;

/** 检索结果默认条数上限（FTS 单次查询的 LIMIT）。 */
export const DEFAULT_SEARCH_LIMIT = 50;

/**
 * 把用户查询包成 FTS5 短语（双引号包裹，内部双引号翻倍）。
 * 用户输入只作为短语内容参与 MATCH，不进入 SQL 文本，避免 FTS 语法注入。
 */
export function toFtsPhrase(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

/**
 * 把查询转成 LIKE 子串模式（转义 `%` `_` `\`），配合 SQL 的 `ESCAPE '\'` 使用。
 * 用于标题回退检索，覆盖未进入 FTS 索引的节点类型。
 */
export function toLikePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
