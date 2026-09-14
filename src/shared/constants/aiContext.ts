/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * AI 上下文注入与可信检索的长度预算单源（docs/design/37）。
 * 注入内容与检索片段共用这里的上限；改数值只改本文件。
 */

/** 一次会话自动注入的上下文总量上限（字符）。与提示装配器的全量 charBudget 分开计算。 */
export const CONTEXT_INJECTION_CHAR_BUDGET = 6000;

/** 单条注入条目的正文上限（字符）：超长截断并进入被裁记录。 */
export const MAX_INJECTION_ENTRY_CHARS = 2000;

/** 当前章节正文片段的保留长度（字符，取正文末尾）。 */
export const CHAPTER_BODY_SNIPPET_CHARS = 1200;

/** 关键词检索注入的相关条目条数上限。 */
export const MAX_RETRIEVAL_INJECTION_ENTRIES = 5;

/** 时间线事件注入条数上限。 */
export const MAX_INJECTION_TIMELINE_EVENTS = 4;

/** 关键词命中需要的最小长度（短词命中噪声大）。 */
export const INJECTION_TRIGGER_MIN_LENGTH = 2;

/** 剩余预算低于该值时不再保留被截断的条目（避免只剩标题无内容）。 */
export const MIN_INJECTION_KEEP_CHARS = 80;
