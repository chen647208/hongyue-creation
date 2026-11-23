/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import SidePanel from '@/shared/ui/SidePanel';
import Slot from '@/shared/ui/Slot';
import { Textarea } from '@/shared/ui/Textarea';

import type { WritingSidebarProps } from '../types';
import ChapterNavigationSection from './ChapterNavigationSection';
import ChapterSummarySection from './ChapterSummarySection';
import WritingAnnotationsPanel from './WritingAnnotationsPanel';
import WritingBlockRefsPanel from './WritingBlockRefsPanel';
import WritingEntityPanel from './WritingEntityPanel';

const WritingSidebar: React.FC<WritingSidebarProps> = ({
  project,
  activeChapter,
  activeChapterId,
  chapters,
  summaryPrompts,
  selectedSummaryPromptId,
  isExtractingSummary,
  hasModel,
  width,
  onWidthChange,
  onClose,
  onChapterSummaryChange,
  onContentSummaryChange,
  onSummaryPromptChange,
  onExtractSummary,
  onChapterClick,
  onNavigateToCharacters,
  onDeleteChapter,
  onChaptersChange,
  onBatchDeleteChapter,
  onInsertEntity,
  blockRefs,
  annotationPanel,
}) => {
  const { t } = useTranslation('writing');
  return (
    <SidePanel
      title={t('sidebar.title')}
      side="left"
      width={width}
      onWidthChange={onWidthChange}
      onClose={onClose}
      closeLabel={t('sidebar.close')}
      resizeLabel={t('sidebar.resize')}
      contentClassName="space-y-6"
      actions={<Slot id="sidebar.actions" />}
    >
        <WritingEntityPanel project={project} activeChapter={activeChapter} onInsertEntity={onInsertEntity} />

        {project.characters.length === 0 && onNavigateToCharacters && (
          <Button variant="outline" size="sm" className="w-full" onClick={onNavigateToCharacters}>
            {t('sidebar.goCharacters')}
          </Button>
        )}

        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('sidebar.outlineTitle')}</h4>
          <Textarea
            value={activeChapter?.summary || ''}
            onChange={(event) => onChapterSummaryChange(event.target.value)}
            placeholder={t('sidebar.outlinePlaceholder')}
            className="min-h-[120px] bg-muted/40 text-xs leading-relaxed whitespace-pre-wrap"
          />
        </section>

        <ChapterSummarySection
          activeChapter={activeChapter}
          summaryPrompts={summaryPrompts}
          selectedSummaryPromptId={selectedSummaryPromptId}
          isExtractingSummary={isExtractingSummary}
          hasModel={hasModel}
          onContentSummaryChange={onContentSummaryChange}
          onSummaryPromptChange={onSummaryPromptChange}
          onExtractSummary={onExtractSummary}
        />

        <ChapterNavigationSection
          chapters={chapters}
          activeChapterId={activeChapterId}
          onChapterClick={onChapterClick}
          onDeleteChapter={onDeleteChapter}
          onChaptersChange={onChaptersChange}
          onBatchDeleteChapter={onBatchDeleteChapter}
        />

        <WritingBlockRefsPanel {...blockRefs} />

        <WritingAnnotationsPanel {...annotationPanel} />
    </SidePanel>
  );
};

export default WritingSidebar;
