/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 章节细纲：AI 文本解析与上下文块拼装（纯函数，便于单测）。
 */
import { uuidv7 } from '@core/entities';

import { roleLabel } from '@/shared/utils/displayLabels';

import {
  EXTRACT_OUTLINE_BATCH_SIZE,
  EXTRACT_OUTLINE_BATCH_TOKEN_BUDGET,
  EXTRACT_OUTLINE_PER_CHAPTER_LIMIT,
  EXTRACT_OUTLINE_SUMMARY_TARGET,
} from '../../../../shared/constants/chapters';
import { type Chapter, type Project, type TokenUsage } from '../../../../shared/types';

const CHAPTER_REGEX = /第\s*([0-9一二三四五六七八九十百]+)\s*章[:：]?\s*([^\n]+)([\s\S]*?)(?=第\s*[0-9一二三四五六七八九十百]+\s*章|---|$(?![\s\S]))/gi;
const EXTRACT_CHAPTER_REGEX = /第\s*([0-9一二三四五六七八九十百千零〇两]+)\s*章\s*[｜|:：]?\s*([^\n]*)\n?([\s\S]*?)(?=第\s*[0-9一二三四五六七八九十百千零〇两]+\s*章|$(?![\s\S]))/gi;
const SUMMARY_MARKERS = ['剧情细纲[:：]', '内容[:：]', '情节[:：]', '本章细纲[:：]'];
const EXTRACT_SUMMARY_MARKERS = [...SUMMARY_MARKERS, '细纲[:：]'];

export interface ParseChapterFallbacks {
  /** 无标题时的默认章节名，入参为 1 起的章节号。 */
  titleFor: (num: number) => string;
  /** 无细纲时的默认文案。 */
  defaultSummary: string;
}

/** 从章节块正文里取细纲：命中标记取其后，未命中整段；`---` 截断。 */
function extractSummaryFromBody(bodyRaw: string, markers: readonly string[] = SUMMARY_MARKERS): string {
  let summary = bodyRaw;
  for (const marker of markers) {
    const regex = new RegExp(marker, 'i');
    const markerMatch = bodyRaw.match(regex);
    if (markerMatch && markerMatch.index !== undefined) {
      summary = bodyRaw.substring(markerMatch.index + markerMatch[0].length).trim();
      break;
    }
  }
  return summary.split('---')[0]?.trim() ?? '';
}

const CN_DIGIT_MAP: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNIT_MAP: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** 章节序号文本转整数：支持阿拉伯数字与中文数字（十/百/千），无法解析返回 NaN。 */
export function parseChapterOrdinal(raw: string): number {
  const text = raw.trim();
  if (!text) return Number.NaN;
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  let section = 0;
  let digit = 0;
  for (const ch of text) {
    const digitValue = CN_DIGIT_MAP[ch];
    if (digitValue !== undefined) {
      digit = digitValue;
      continue;
    }
    const unitValue = CN_UNIT_MAP[ch];
    if (unitValue === undefined) return Number.NaN;
    section += (digit || 1) * unitValue;
    digit = 0;
  }
  return section + digit;
}

/** 解析 AI 输出的章节文本为 Chapter（id 新生成，order 从 startIndex 递增）。 */
export function parseChaptersFromAI(text: string, startIndex: number, fallbacks: ParseChapterFallbacks): Chapter[] {
  const matches = Array.from(text.matchAll(CHAPTER_REGEX));
  return matches.map((match, idx) => {
    const titleRaw = match[2]?.trim() ?? '';
    const bodyRaw = match[3]?.trim() ?? '';
    const title = titleRaw.replace(/[#*]/g, '').trim();

    const summary = extractSummaryFromBody(bodyRaw);

    return {
      id: uuidv7(),
      title: title || fallbacks.titleFor(startIndex + idx + 1),
      summary: summary || fallbacks.defaultSummary,
      content: '',
      order: startIndex + idx,
    };
  });
}

/** 章节 prompt 上下文块：人物设定 + 书名简介（模板无占位符时追加，保证不断联）。 */
export function buildChapterContextBlock(p: Project): string {
  const charDetails = (p.characters ?? [])
    .slice(0, 12)
    .map((c) => `【${c.name}】(${roleLabel(c.role)})：${c.personality ?? ''}`)
    .join('\n');
  const parts = ['', '### 本书设定（规划细纲必须服从）', `书名：《${p.title}》`];
  if (p.intro?.trim()) parts.push(`简介：${p.intro}`);
  if (charDetails) parts.push(`人物：\n${charDetails}`);
  return parts.join('\n');
}

// ── 从既有正文提取细纲（与「大纲→细纲」方向互补）──────────────────

/** 提取出的单章细纲草稿；chapterId 锚定既有章节，确认后才写入 summary。 */
export interface OutlineDraft {
  chapterId: string;
  order: number;
  title: string;
  summary: string;
}

/** 把逐条编辑覆盖到草稿文本上：未提供或与原文相同的项原样返回（保持引用稳定）。 */
export function applyDraftEdits(
  drafts: readonly OutlineDraft[],
  edits: Readonly<Record<string, string>>,
): OutlineDraft[] {
  return drafts.map((draft) => {
    const edited = edits[draft.chapterId];
    return edited === undefined || edited === draft.summary ? draft : { ...draft, summary: edited };
  });
}

export interface ExtractionPromptOptions {
  /** 单章正文送模型的截断字符数，默认 EXTRACT_OUTLINE_PER_CHAPTER_LIMIT。 */
  perChapterCharLimit?: number;
  /** 每章细纲目标字数（提示词用），默认 EXTRACT_OUTLINE_SUMMARY_TARGET。 */
  summaryCharTarget?: number;
}

/** 组装「从正文提取细纲」提示词：按 order 编号分块，要求逐章输出细纲。 */
export function buildExtractionPrompt(chapters: Chapter[], options: ExtractionPromptOptions = {}): string {
  const limit = options.perChapterCharLimit ?? EXTRACT_OUTLINE_PER_CHAPTER_LIMIT;
  const target = options.summaryCharTarget ?? EXTRACT_OUTLINE_SUMMARY_TARGET;
  const usable = chapters.filter((c) => (c.content ?? '').trim().length > 0);
  const blocks = usable
    .map((c) => `第${c.order + 1}章 ${c.title}\n【正文】\n${(c.content ?? '').slice(0, limit)}`)
    .join('\n\n');
  return [
    `你是小说编辑。下面是已完成的章节正文，请逐章归纳细纲（本章剧情走向、关键转折与结果），每章约 ${target} 字。`,
    '要求：严格按下方格式输出，每章以「第N章 标题」起始，紧接一行「细纲：」；章与章之间用 --- 分隔；不要照抄正文，不要添加解释。',
    '编号必须与下列各章一致。',
    '',
    blocks,
    '',
    '输出格式示例：',
    '第1章 开端',
    '细纲：……',
    '---',
  ].join('\n');
}

export interface ExtractionBatchOptions {
  /** 每批最多章节数，默认 EXTRACT_OUTLINE_BATCH_SIZE。 */
  batchSize?: number;
  /** 每批近似 token 预算，默认 EXTRACT_OUTLINE_BATCH_TOKEN_BUDGET。 */
  tokenBudget?: number;
  /** 单章正文截断（与提示词口径一致），默认 EXTRACT_OUTLINE_PER_CHAPTER_LIMIT。 */
  perChapterCharLimit?: number;
}

/** 单章送模型的正文字符数（与提示词截断一致），作为 token 近似。 */
export function estimateExtractionTokens(
  chapter: Chapter,
  perChapterCharLimit: number = EXTRACT_OUTLINE_PER_CHAPTER_LIMIT,
): number {
  return Math.min((chapter.content ?? '').trim().length, perChapterCharLimit);
}

/**
 * 按批大小与 token 预算把有正文的章节分批：保持顺序，批次内不超预算；
 * 单章即超预算时仍单独成批（不丢章）。空数组表示没有可提取的正文。
 */
export function planExtractionBatches(
  chapters: readonly Chapter[],
  options: ExtractionBatchOptions = {},
): Chapter[][] {
  const batchSize = options.batchSize ?? EXTRACT_OUTLINE_BATCH_SIZE;
  const budget = options.tokenBudget ?? EXTRACT_OUTLINE_BATCH_TOKEN_BUDGET;
  const perChapterCharLimit = options.perChapterCharLimit ?? EXTRACT_OUTLINE_PER_CHAPTER_LIMIT;
  const usable = chapters.filter((c) => (c.content ?? '').trim().length > 0);

  const batches: Chapter[][] = [];
  let current: Chapter[] = [];
  let used = 0;
  for (const chapter of usable) {
    const cost = estimateExtractionTokens(chapter, perChapterCharLimit);
    if (current.length > 0 && (current.length >= batchSize || used + cost > budget)) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push(chapter);
    used += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** 累加两次 token 用量（缓存字段只在任一侧出现时相加，缺席即 0）。 */
export function addTokenUsage(a: TokenUsage, b: TokenUsage | undefined): TokenUsage {
  if (!b) return a;
  const sum: TokenUsage = {
    prompt: a.prompt + b.prompt,
    completion: a.completion + b.completion,
    total: a.total + b.total,
  };
  if (a.cacheRead !== undefined || b.cacheRead !== undefined) sum.cacheRead = (a.cacheRead ?? 0) + (b.cacheRead ?? 0);
  if (a.cacheWrite !== undefined || b.cacheWrite !== undefined) sum.cacheWrite = (a.cacheWrite ?? 0) + (b.cacheWrite ?? 0);
  return sum;
}

/**
 * 解析提取结果：按 AI 输出的章节序号映射回既有章节（order = 序号 - 1），
 * 只保留命中且有细纲的章；标题沿用既有章节，不采用 AI 回显。
 */
export function parseExtractionResult(text: string, chapters: Chapter[]): OutlineDraft[] {
  const byOrder = new Map(chapters.map((c) => [c.order, c]));
  const drafts: OutlineDraft[] = [];
  const seen = new Set<number>();
  for (const match of text.matchAll(EXTRACT_CHAPTER_REGEX)) {
    const ordinal = parseChapterOrdinal(match[1] ?? '');
    if (!Number.isFinite(ordinal)) continue;
    const order = ordinal - 1;
    if (seen.has(order)) continue;
    const chapter = byOrder.get(order);
    if (!chapter) continue;
    const summary = extractSummaryFromBody((match[3] ?? '').trim(), EXTRACT_SUMMARY_MARKERS);
    if (!summary) continue;
    seen.add(order);
    drafts.push({ chapterId: chapter.id, order, title: chapter.title, summary });
  }
  return drafts.sort((a, b) => a.order - b.order);
}

export interface ApplyDraftOptions {
  /** 只应用这些章节 id；缺省为全部草稿。 */
  selectedIds?: ReadonlySet<string>;
}

export interface ApplyDraftResult {
  chapters: Chapter[];
  /** 实际写入的章节 id。 */
  appliedIds: string[];
  /** 已有细纲、按规则跳过（不覆盖）的章节 id。 */
  skippedExistingIds: string[];
}

/** 把草稿写入章节细纲：只写空白细纲，已有细纲的章节一律跳过（不覆盖）。 */
export function applyOutlineDrafts(chapters: Chapter[], drafts: readonly OutlineDraft[], options: ApplyDraftOptions = {}): ApplyDraftResult {
  const draftByChapter = new Map(drafts.map((d) => [d.chapterId, d]));
  const appliedIds: string[] = [];
  const skippedExistingIds: string[] = [];
  const next = chapters.map((chapter) => {
    const draft = draftByChapter.get(chapter.id);
    if (!draft) return chapter;
    if ((chapter.summary ?? '').trim()) {
      skippedExistingIds.push(chapter.id);
      return chapter;
    }
    if (options.selectedIds && !options.selectedIds.has(chapter.id)) return chapter;
    appliedIds.push(chapter.id);
    return { ...chapter, summary: draft.summary };
  });
  return { chapters: next, appliedIds, skippedExistingIds };
}
