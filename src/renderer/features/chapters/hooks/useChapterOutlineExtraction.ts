/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 从既有正文提取细纲草稿：与 useChapterOutlineGeneration（大纲→细纲）互补。
 * 章节多时按批大小与 token 预算分批送模型；某批失败可续提剩余批次。
 * 结果为预览态（draft），用户确认后 applyDraft 才写入，且只写空白细纲、不覆盖既有细纲。
 * AI 调用走既有 AIService 网关路径，不在渲染层直连。
 */
import type { TFunction } from 'i18next';
import { useState } from 'react';

import { AIService } from '@/shared/services/ai/aiService';
import { dialogService } from '@/shared/services/dialogService';
import { logger } from '@/shared/utils/logger';
import { isModelUsable } from '@/shared/utils/modelReadiness';

import { isVirtualChapter } from '../../../../shared/constants/chapters';
import { type Chapter, type ModelConfig, type Project, type TokenUsage } from '../../../../shared/types';
import {
  addTokenUsage,
  applyOutlineDrafts,
  buildExtractionPrompt,
  type OutlineDraft,
  parseExtractionResult,
  planExtractionBatches,
} from '../services/chapterOutline';

const EMPTY_TOKENS: TokenUsage = { prompt: 0, completion: 0, total: 0 };

interface UseChapterOutlineExtractionOptions {
  project: Project;
  activeModel: ModelConfig | undefined;
  onUpdate: (updates: Partial<Project>, opts?: { agentId?: string; cause?: string }) => void;
  t: TFunction<['steps', 'common']>;
}

export function useChapterOutlineExtraction({
  project,
  activeModel,
  onUpdate,
  t,
}: UseChapterOutlineExtractionOptions) {
  const [extracting, setExtracting] = useState(false);
  const [draft, setDraft] = useState<OutlineDraft[] | null>(null);
  const [tokens, setTokens] = useState<TokenUsage>(EMPTY_TOKENS);
  /** 失败后尚未提取的批次（空=无待续）。 */
  const [remaining, setRemaining] = useState<Chapter[][]>([]);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  /** 顺序跑批次；失败时保留已完成草稿并把剩余批次留待续提。 */
  const runBatches = async (batches: Chapter[][], baseDraft: OutlineDraft[], baseTokens: TokenUsage): Promise<void> => {
    let accumulated = baseDraft;
    let accumulatedTokens = baseTokens;
    setBatchProgress({ done: 0, total: batches.length });
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      if (!batch) continue;
      const result = await AIService.call(activeModel as ModelConfig, buildExtractionPrompt(batch));
      if (result.error) {
        setRemaining(batches.slice(index));
        setDraft(accumulated.length > 0 ? accumulated : null);
        setTokens(accumulatedTokens);
        dialogService.alert(
          t('steps:chapters.extractPartial', { done: index, total: batches.length, error: result.error }),
        );
        return;
      }
      accumulated = [...accumulated, ...parseExtractionResult(result.content, batch)];
      accumulatedTokens = addTokenUsage(accumulatedTokens, result.tokens);
      setDraft(accumulated);
      setTokens(accumulatedTokens);
      setBatchProgress({ done: index + 1, total: batches.length });
    }
    setRemaining([]);
    if (accumulated.length === 0) {
      dialogService.alert(t('steps:chapters.extractEmpty'));
    }
  };

  const extract = async (chapters: Chapter[]) => {
    const targets = chapters.filter((c) => !isVirtualChapter(c) && (c.content ?? '').trim().length > 0);
    if (targets.length === 0) {
      dialogService.alert(t('steps:chapters.extractNoContent'));
      return;
    }
    if (!activeModel || !isModelUsable(activeModel)) {
      dialogService.alert(t('steps:common.noModel'));
      return;
    }

    setExtracting(true);
    setTokens(EMPTY_TOKENS);
    setDraft(null);
    setRemaining([]);
    try {
      await runBatches(planExtractionBatches(targets), [], EMPTY_TOKENS);
    } catch (err) {
      logger.error(err);
      dialogService.alert(t('steps:chapters.extractFailed', { error: err instanceof Error ? err.message : t('steps:common.unknownError') }));
    } finally {
      setExtracting(false);
    }
  };

  /** 续提上一轮失败后剩下的批次（草稿与 token 累加保留）。 */
  const extractRemaining = async () => {
    if (remaining.length === 0) return;
    if (!activeModel || !isModelUsable(activeModel)) {
      dialogService.alert(t('steps:common.noModel'));
      return;
    }
    setExtracting(true);
    try {
      await runBatches(remaining, draft ?? [], tokens);
    } catch (err) {
      logger.error(err);
      dialogService.alert(t('steps:chapters.extractFailed', { error: err instanceof Error ? err.message : t('steps:common.unknownError') }));
    } finally {
      setExtracting(false);
    }
  };

  /** 应用选中的草稿（草稿文本可逐条编辑后再传）；只写空白细纲，已有细纲的章节不覆盖。 */
  const applyDraft = (selectedIds: ReadonlySet<string>, drafts?: readonly OutlineDraft[]): void => {
    const source = drafts ?? draft;
    if (!source || source.length === 0) return;
    const { chapters, appliedIds } = applyOutlineDrafts(project.chapters, source, { selectedIds });
    if (appliedIds.length === 0) {
      dialogService.alert(t('steps:chapters.draftNoneSelected'));
      return;
    }
    onUpdate({ chapters }, { agentId: 'ai:chapters', cause: 'chapter-outline-extract' });
    setDraft(null);
    setTokens(EMPTY_TOKENS);
    setRemaining([]);
    setBatchProgress({ done: 0, total: 0 });
    dialogService.alert(t('steps:chapters.draftApplied', { count: appliedIds.length }));
  };

  const discardDraft = (): void => {
    setDraft(null);
    setTokens(EMPTY_TOKENS);
    setRemaining([]);
    setBatchProgress({ done: 0, total: 0 });
  };

  return {
    extracting,
    draft,
    tokens,
    batchProgress,
    hasRemaining: remaining.length > 0,
    extract,
    extractRemaining,
    applyDraft,
    discardDraft,
  };
}
