/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { AlignCenterVertical, ArrowLeft, Camera, ChevronsRight, Eraser, Expand, FileOutput, FileText, History, Lock, Maximize2, Merge, Minimize2, Redo2, RotateCcw, Scissors, Search, SpellCheck, Sprout, Undo2, Unlock, Wrench } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { PageHeader, PageHeaderDivider } from '@/shared/ui/PageHeader';
import { Progress } from '@/shared/ui/Progress';
import Slot from '@/shared/ui/Slot';
import { cn } from '@/shared/utils/cn';

import { formatCharCount } from '../services/writingStatsService';
import type { WritingEditorToolbarProps } from '../types';

const iconBtn = 'size-8 text-muted-foreground';
const textBtn = 'h-8 gap-1.5 px-2 text-xs text-muted-foreground';
// 窄视口只保留核心编辑动作（撤销/重做/查找/拼写/工具/侧栏），其余收进桌面宽度
const iconBtnSecondary = cn(iconBtn, 'hidden md:inline-flex');
const textBtnSecondary = cn(textBtn, 'hidden md:inline-flex');

const WritingEditorToolbar: React.FC<WritingEditorToolbarProps> = ({
  activeChapterId,
  activeChapterTitle,
  hasProjectChapters,
  hasActiveChapterHistory,
  isSidebarOpen,
  isGlobalHistorySidebarOpen,
  chapterStats,
  bookStats,
  snapshotCount,
  openForeshadowCount,
  overdueForeshadowCount,
  isFocusMode,
  lastSaved,
  targetWordCount,
  typewriter,
  saveDirty,
  canUndo,
  canRedo,
  onBack,
  onTitleChange,
  onOpenExport,
  onOpenForeshadow,
  onClearContent,
  onToggleGlobalHistory,
  onOpenChapterHistory,
  onOpenSidebar,
  onToggleFocusMode,
  onToggleTypewriter,
  onUndo,
  onRedo,
  onManualSnapshot,
  canRetryAI,
  onRetryAI,
  spellcheckOn,
  onToggleSpellcheck,
  onToggleFind,
  canSplitChapter,
  canMergeChapter,
  onSplitChapter,
  onMergeChapter,
  chapterFinal,
  onToggleFinal,
  onOpenTools,
}) => {
  const { t, i18n } = useTranslation('writing');
  const progress = targetWordCount > 0 ? Math.min(1, chapterStats.charCount / targetWordCount) : 0;
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      // 非 Electron/浏览器限制时静默
    }
  };
  return (
    <PageHeader
      className={cn(isFocusMode && 'bg-background/80 backdrop-blur-sm')}
      left={
        <>
          {!isFocusMode ? (
            <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onBack} title={t('toolbar.back')}>
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 opacity-40 hover:opacity-100"
              onClick={onBack}
              title={t('toolbar.backFocus')}
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}
          {activeChapterId ? (
            <input
              className="min-w-0 flex-1 basis-40 border-none bg-transparent p-0 font-serif text-lg font-medium text-foreground outline-none placeholder:text-muted-foreground/40"
              value={activeChapterTitle}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder={t('toolbar.titlePlaceholder')}
            />
          ) : (
            <span className="font-serif text-lg font-medium text-muted-foreground">{t('toolbar.selectChapter')}</span>
          )}
        </>
      }
      right={
        <>
          <Slot id="editor.toolbar" />
          {/* 统计组：本章 / 全书 / 今日增量（按工具条实际宽度折叠，容器查询） */}
          <div
            className="hidden items-center gap-2.5 text-xs text-muted-foreground @2xl:flex"
            title={t('toolbar.statsTitle', { paragraphs: chapterStats.paragraphs, sentences: chapterStats.sentences, minutes: chapterStats.readingMinutes })}
          >
            <span>
              {t('toolbar.thisChapter')}
              <span className="ml-0.5 font-medium tabular-nums text-foreground">{formatCharCount(chapterStats.charCount)}</span>
            </span>
            <span className="text-border">|</span>
            <span>
              {t('toolbar.wholeBook')}
              <span className="ml-0.5 font-medium tabular-nums text-foreground">{formatCharCount(bookStats.totalCharCount)}</span>
            </span>
            {bookStats.todayCharCount > 0 && (
              <>
                <span className="text-border">|</span>
                <span className="text-success">{t('toolbar.todayAdded', { count: formatCharCount(bookStats.todayCharCount) })}</span>
              </>
            )}
          </div>
          <PageHeaderDivider className="hidden @2xl:block" />

          {!isFocusMode && (
            <>
              <Button variant="ghost" size="icon" className={iconBtn} onClick={onUndo} disabled={!canUndo} title={t('toolbar.undoTitle')}>
                <Undo2 className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className={iconBtn} onClick={onRedo} disabled={!canRedo} title={t('toolbar.redoTitle')}>
                <Redo2 className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className={iconBtnSecondary} onClick={onRetryAI} disabled={!canRetryAI} title={t('toolbar.retryTitle')}>
                <RotateCcw className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(iconBtn, spellcheckOn && 'bg-accent text-foreground')}
                onClick={onToggleSpellcheck}
                title={t('toolbar.spellTitle')}
              >
                <SpellCheck className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className={iconBtn} onClick={onToggleFind} title={t('toolbar.findTitle')}>
                <Search className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(iconBtnSecondary, chapterFinal && 'bg-accent text-foreground')}
                onClick={onToggleFinal}
                disabled={!activeChapterId}
                title={chapterFinal ? t('toolbar.unfinalTitle') : t('toolbar.finalTitle')}
              >
                {chapterFinal ? <Lock className="size-4" /> : <Unlock className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" className={iconBtn} onClick={onOpenTools} title={t('toolbar.toolsTitle')}>
                <Wrench className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className={iconBtnSecondary} onClick={onSplitChapter} disabled={!canSplitChapter} title={t('toolbar.splitChapterTitle')}>
                <Scissors className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className={iconBtnSecondary} onClick={onMergeChapter} disabled={!canMergeChapter} title={t('toolbar.mergeChapterTitle')}>
                <Merge className="size-4" />
              </Button>
              {activeChapterId && (
                <Button variant="ghost" size="sm" className={textBtnSecondary} onClick={onManualSnapshot} title={t('toolbar.snapshotTitle', { count: snapshotCount })}>
                  <Camera className="size-4" /> <span className="hidden @3xl:inline">{t('toolbar.snapshot')}</span>
                </Button>
              )}
              {hasProjectChapters && (
                <Button variant="ghost" size="sm" className={textBtnSecondary} onClick={onOpenExport} title={t('toolbar.exportTitle')}>
                  <FileOutput className="size-4" /> <span className="hidden @3xl:inline">{t('toolbar.export')}</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className={cn(textBtnSecondary, overdueForeshadowCount > 0 ? 'text-destructive hover:text-destructive' : 'hover:text-foreground')}
                onClick={onOpenForeshadow}
                title={overdueForeshadowCount > 0 ? t('toolbar.foreshadowTitleOverdue', { open: openForeshadowCount, overdue: overdueForeshadowCount }) : t('toolbar.foreshadowTitle', { open: openForeshadowCount })}
              >
                <Sprout className="size-4" /> <span className="hidden @3xl:inline">{t('toolbar.foreshadow')}</span>
                {openForeshadowCount > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-2xs font-medium tabular-nums',
                      overdueForeshadowCount > 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                    )}
                  >
                    {openForeshadowCount}
                  </span>
                )}
              </Button>
              {activeChapterId && (
                <Button variant="ghost" size="icon" className={cn(iconBtnSecondary, 'hover:text-destructive')} onClick={onClearContent} title={t('toolbar.clearTitle')}>
                  <Eraser className="size-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className={cn(textBtnSecondary, isGlobalHistorySidebarOpen && 'bg-accent text-foreground')}
                onClick={onToggleGlobalHistory}
                title={t('toolbar.globalHistoryTitle')}
              >
                <History className="size-4" /> <span className="hidden @3xl:inline">{t('toolbar.globalHistory')}</span>
              </Button>
              {activeChapterId && hasActiveChapterHistory && (
                <Button variant="ghost" size="icon" className={iconBtnSecondary} onClick={onOpenChapterHistory} title={t('toolbar.chapterHistoryTitle')}>
                  <FileText className="size-4" />
                </Button>
              )}
              <PageHeaderDivider />
            </>
          )}

          {/* 视图组：专注 / 全屏 / 打字机 / 侧栏 */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(iconBtn, isFocusMode && 'text-primary hover:text-primary')}
            onClick={onToggleFocusMode}
            title={isFocusMode ? t('toolbar.exitFocusTitle') : t('toolbar.enterFocusTitle')}
          >
            {isFocusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon" className={iconBtnSecondary} onClick={toggleFullscreen} title={t('toolbar.fullscreen')}>
            <Expand className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(iconBtnSecondary, typewriter && 'bg-accent text-foreground')}
            onClick={onToggleTypewriter}
            title={typewriter ? t('toolbar.typewriterOff') : t('toolbar.typewriterOn')}
          >
            <AlignCenterVertical className="size-4" />
          </Button>
          {!isSidebarOpen && !isFocusMode && (
            <Button variant="ghost" size="icon" className={iconBtn} onClick={onOpenSidebar} title={t('toolbar.openSidebar')}>
              <ChevronsRight className="size-4" />
            </Button>
          )}
          <PageHeaderDivider />

          {/* 状态组：保存状态；目标进度并入底边细条 */}
          <span
            className={cn('w-16 text-right text-xs tabular-nums', saveDirty ? 'font-medium text-warning' : 'text-muted-foreground')}
            title={saveDirty ? t('toolbar.unsaved') : t('toolbar.autoSave', { time: new Date(lastSaved).toLocaleTimeString(i18n.language) })}
          >
            {saveDirty ? t('toolbar.unsaved') : new Date(lastSaved).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
          </span>
        </>
      }
    >
      {/* 底边目标进度细条：替代原先悬空的字数竖块 */}
      {targetWordCount > 0 && (
        <div
          className="absolute inset-x-0 bottom-0"
          title={`${chapterStats.charCount}/${targetWordCount}`}
        >
          <Progress value={Math.round(progress * 100)} className="h-0.5 rounded-none bg-muted" />
        </div>
      )}
    </PageHeader>
  );
};

export default WritingEditorToolbar;
