/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 译文/原文段落对照（docs/design/41 §4）。
 *
 * 对齐关系是段落间的关联，不改正文结构：本模块是纯函数集合，
 * 按段落序合并两侧文本，未变的段落保留其确认状态，正文变动后重算即丢失该段确认。
 * 持久化落在 Project.translation（侧车），不进入正文与导出。
 */
import type { TranslationAlignment, TranslationPair } from '../../shared/types';

/** 按空行拆段，去掉首尾空白行；无内容返回空数组。 */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

export interface AlignmentStats {
  total: number;
  confirmed: number;
}

/** 统计对照进度。 */
export function alignmentStats(alignment: TranslationAlignment | undefined): AlignmentStats {
  const pairs = alignment?.pairs ?? [];
  return { total: pairs.length, confirmed: pairs.filter((pair) => pair.confirmed).length };
}

/**
 * 重算对齐：按段序把原文与译文配成对，沿用既有 pair 的 id 与确认状态（仅当两侧文本未变）。
 * 未配对的段落以空串补齐；入参不改动。
 */
export function alignParagraphs(
  existing: readonly TranslationPair[],
  source: string,
  target: string,
): TranslationPair[] {
  const sourceParagraphs = splitParagraphs(source);
  const targetParagraphs = splitParagraphs(target);
  const count = Math.max(sourceParagraphs.length, targetParagraphs.length);
  const out: TranslationPair[] = [];
  for (let index = 0; index < count; index += 1) {
    const src = sourceParagraphs[index] ?? '';
    const tgt = targetParagraphs[index] ?? '';
    const previous = existing[index];
    const unchanged = previous !== undefined && previous.source === src && previous.target === tgt;
    const pair: TranslationPair = {
      id: previous?.id ?? `pair:${index + 1}`,
      source: src,
      target: tgt,
      confirmed: unchanged ? previous.confirmed : false,
    };
    if (previous?.sourceBlockId) pair.sourceBlockId = previous.sourceBlockId;
    out.push(pair);
  }
  return out;
}

/** 设置某段的确认状态；未知 pairId 原样返回。 */
export function setPairConfirmed(
  alignment: TranslationAlignment | undefined,
  pairId: string,
  confirmed: boolean,
): TranslationAlignment {
  const pairs = alignment?.pairs ?? [];
  return { pairs: pairs.map((pair) => (pair.id === pairId ? { ...pair, confirmed } : pair)) };
}

/** 更新某段的译文；正文改写后该段确认失效。 */
export function setPairTarget(
  alignment: TranslationAlignment | undefined,
  pairId: string,
  target: string,
): TranslationAlignment {
  const pairs = alignment?.pairs ?? [];
  return {
    pairs: pairs.map((pair) =>
      pair.id === pairId ? { ...pair, target, confirmed: pair.target === target ? pair.confirmed : false } : pair,
    ),
  };
}
