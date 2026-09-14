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
  applyOutlineDrafts,
  buildExtractionPrompt,
  type OutlineDraft,
  parseExtractionResult,
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
    try {
      const result = await AIService.call(activeModel, buildExtractionPrompt(targets));
      if (result.error) {
        dialogService.alert(t('steps:common.generateFailed', { error: result.error }));
        return;
      }
      const parsed = parseExtractionResult(result.content, targets);
      if (parsed.length === 0) {
        dialogService.alert(t('steps:chapters.extractEmpty'));
        return;
      }
      setDraft(parsed);
      if (result.tokens) setTokens(result.tokens);
    } catch (err) {
      logger.error(err);
      dialogService.alert(t('steps:chapters.extractFailed', { error: err instanceof Error ? err.message : t('steps:common.unknownError') }));
    } finally {
      setExtracting(false);
    }
  };

  /** 应用选中的草稿；只写空白细纲，已有细纲的章节不覆盖。 */
  const applyDraft = (selectedIds: ReadonlySet<string>): void => {
    if (!draft) return;
    const { chapters, appliedIds } = applyOutlineDrafts(project.chapters, draft, { selectedIds });
    if (appliedIds.length === 0) {
      dialogService.alert(t('steps:chapters.draftNoneSelected'));
      return;
    }
    onUpdate({ chapters }, { agentId: 'ai:chapters', cause: 'chapter-outline-extract' });
    setDraft(null);
    setTokens(EMPTY_TOKENS);
    dialogService.alert(t('steps:chapters.draftApplied', { count: appliedIds.length }));
  };

  const discardDraft = (): void => {
    setDraft(null);
    setTokens(EMPTY_TOKENS);
  };

  return { extracting, draft, tokens, extract, applyDraft, discardDraft };
}
