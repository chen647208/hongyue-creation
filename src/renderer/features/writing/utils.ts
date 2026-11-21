/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Bot, Brain, Cpu, Feather, type LucideIcon,Server } from 'lucide-react';

import { i18n } from '@/i18n';

import type { AIHistoryRecord, Chapter } from '../../../shared/types';
import {
  FLOATING_MENU_HEIGHT,
  FLOATING_MENU_OFFSET_X,
  FLOATING_MENU_OFFSET_Y,
  FLOATING_MENU_VIEWPORT_MARGIN,
  FLOATING_MENU_WIDTH,
  MAX_CHAPTER_CONTEXT_LENGTH,
  MAX_PREVIOUS_CHAPTER_SUMMARIES,
} from './constants';
import type { TextSelectionRange, TokenUsage } from './types';

export const debounce = <Args extends unknown[]>(func: (...args: Args) => void, wait: number) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export const getChapterContext = (chapters: Chapter[], currentChapter: Chapter) => {
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
  const currentIndex = sortedChapters.findIndex((chapter) => chapter.id === currentChapter.id);
  const previousChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] ?? null : null;
  const previousContent = previousChapter?.content?.trim() || '';
  const previousContextText = previousContent.length > MAX_CHAPTER_CONTEXT_LENGTH
    ? `...${previousContent.slice(-MAX_CHAPTER_CONTEXT_LENGTH)}`
    : previousContent;
  const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] ?? null : null;
  const nextSummary = nextChapter?.summary?.trim() || '';

  return {
    prevChapter: previousChapter,
    prevContextText: previousContextText,
    nextChapter,
    nextSummary,
  };
};

export const toggleSetValue = (source: Set<string>, value: string) => {
  const next = new Set(source);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
};

export const getPreviousChapterSummaryIds = (chapters: Chapter[], currentChapter: Chapter | null | undefined) => {
  if (!currentChapter) {
    return new Set<string>();
  }

  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
  const currentIndex = sortedChapters.findIndex((chapter) => chapter.id === currentChapter.id);
  const previousChapters = sortedChapters.slice(Math.max(0, currentIndex - MAX_PREVIOUS_CHAPTER_SUMMARIES), currentIndex);

  return new Set(
    previousChapters
      .filter((chapter) => chapter.contentSummary && chapter.contentSummary.trim().length > 0)
      .map((chapter) => chapter.id),
  );
};

export const getFloatingMenuPosition = (x: number, y: number) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let nextX = x + FLOATING_MENU_OFFSET_X;
  let nextY = y + FLOATING_MENU_OFFSET_Y;

  if (nextX + FLOATING_MENU_WIDTH > viewportWidth - FLOATING_MENU_VIEWPORT_MARGIN) {
    nextX = viewportWidth - FLOATING_MENU_WIDTH - FLOATING_MENU_VIEWPORT_MARGIN;
  } else if (nextX < FLOATING_MENU_VIEWPORT_MARGIN) {
    nextX = FLOATING_MENU_VIEWPORT_MARGIN;
  }

  if (nextY + FLOATING_MENU_HEIGHT > viewportHeight - FLOATING_MENU_VIEWPORT_MARGIN) {
    nextY = viewportHeight - FLOATING_MENU_HEIGHT - FLOATING_MENU_VIEWPORT_MARGIN;
  } else if (nextY < FLOATING_MENU_VIEWPORT_MARGIN) {
    nextY = FLOATING_MENU_VIEWPORT_MARGIN;
  }

  return { x: nextX, y: nextY };
};

export const isSelectionAvailable = (range: TextSelectionRange | null) => {
  return !!range && range.end > range.start;
};

export const formatHistoryTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const formatTokenUsage = (tokens?: TokenUsage) => {
  if (!tokens) {
    return 'N/A';
  }
  return i18n.t('writing:utils.tokenUsage', { input: tokens.prompt, output: tokens.completion, total: tokens.total });
};

export const getProviderIcon = (provider: string): { icon: LucideIcon; cls: string } => {
  switch (provider) {
    case 'gemini':
      return { icon: Bot, cls: 'text-chart-1' };
    case 'ollama':
      return { icon: Server, cls: 'text-chart-5' };
    case 'anthropic':
      return { icon: Feather, cls: 'text-chart-6' };
    case 'openai-responses':
      return { icon: Brain, cls: 'text-chart-4' };
    case 'openai-chat':
      return { icon: Brain, cls: 'text-chart-4' };
    default:
      return { icon: Cpu, cls: 'text-chart-gray' };
  }
};

export const getGenerationType = (record: AIHistoryRecord) => {
  // 模板名匹配基于项目数据中存储的中文模板名（数据值），保持字面
  if (record.metadata?.batchGeneration) {
    return i18n.t('writing:utils.genTypeBatch');
  }
  if (record.metadata?.templateName?.includes('润色') || record.metadata?.templateName?.includes('扩写')) {
    return i18n.t('writing:utils.genTypePolish');
  }
  return i18n.t('writing:utils.genTypeContent');
};
