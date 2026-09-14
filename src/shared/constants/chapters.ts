/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 章节域魔法数字单源：虚拟章节哨兵、提示词截断长度、混合检索权重。
 * 改数值只改这里；行为保持不变（各调用点原值原样收拢）。
 */

/** 虚拟章节序号：AI 历史/草稿槽位，不进章节列表 */
export const VIRTUAL_CHAPTER_ORDER = -100;

/** 历史遗留的虚拟章节 id（迁移期识别用） */
export const VIRTUAL_CHAPTER_IDS: readonly string[] = [
  'inspiration-virtual-chapter',
  'characters-virtual-chapter',
  'outline-virtual-chapter',
  'chapter-outline-virtual-chapter',
];

/** 是否虚拟章节：序号为负或 id 在遗留清单 */
export function isVirtualChapter(chapter: { id?: string; order?: number }): boolean {
  return (chapter.order ?? 0) < 0 || (chapter.id !== undefined && (VIRTUAL_CHAPTER_IDS as readonly string[]).includes(chapter.id));
}

/** 知识库资料拼提示词时的单条截断（字符） */
export const KNOWLEDGE_SNIPPET_TRUNCATE = 8000;

/** 正文写作提示词里的参考资料截断（字符） */
export const PROMPT_KNOWLEDGE_TRUNCATE = 10000;

/** 从正文提取细纲：单章正文送模型的字符上限 */
export const EXTRACT_OUTLINE_PER_CHAPTER_LIMIT = 6000;

/** 从正文提取细纲：每章细纲目标字数（提示词用） */
export const EXTRACT_OUTLINE_SUMMARY_TARGET = 150;

/** 助手附件内容截断（字符，超长标注已截断） */
export const ATTACHMENT_TRUNCATE = 15000;

/** 混合检索默认语义权重（keywordWeight 默认 0.3，见调用方） */
export const DEFAULT_SEMANTIC_WEIGHT = 0.7;

/** 混合检索默认关键词权重 */
export const DEFAULT_KEYWORD_WEIGHT = 0.3;
