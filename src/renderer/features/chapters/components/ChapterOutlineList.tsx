/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 章节细纲列表（表格/卡片两种视图，从 StepChapterOutline 抽出）。 */
import { ChevronDown, ChevronUp, FileSearch, PenTool, Trash2 } from 'lucide-react';
import React from 'react';

import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Label } from '@/shared/ui/Label';
import { Textarea } from '@/shared/ui/Textarea';

import { type Chapter, type Project } from '../../../../shared/types';

export interface ChapterOutlineListProps {
  chapters: Chapter[];
  view: 'cards' | 'table';
  dragId: string | null;
  dropIndex: number | null;
  setDragId: (id: string | null) => void;
  setDropIndex: (index: number | null) => void;
  clearDragState: () => void;
  moveChapter: (id: string, delta: -1 | 1) => void;
  moveChapterTo: (id: string, index: number) => void;
  onEnterWriting: (chapterId: string) => void;
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  renderRelationEditor: (chapter: Chapter) => React.ReactNode;
  /** 从该章既有正文提取细纲草稿；未提供则不显示入口。 */
  onExtractOutline?: (chapter: Chapter) => void;
  /** 提取中或无可用模型时禁用。 */
  extractOutlineDisabled?: boolean;
}

export const ChapterOutlineList: React.FC<ChapterOutlineListProps> = ({
  chapters,
  view,
  dragId,
  dropIndex,
  setDragId,
  setDropIndex,
  clearDragState,
  moveChapter,
  moveChapterTo,
  onEnterWriting,
  project,
  onUpdate,
  renderRelationEditor,
  onExtractOutline,
  extractOutlineDisabled,
}) => {
  const { t } = useTranslation(['steps', 'common']);

  if (view === 'table') {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        {chapters.map((chap, idx) => (
          <div
            key={chap.id}
            draggable
            onDragStart={(e) => { setDragId(chap.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropIndex !== idx) setDropIndex(idx); }}
            onDrop={(e) => { e.preventDefault(); if (dragId) moveChapterTo(dragId, idx); clearDragState(); }}
            onDragEnd={clearDragState}
            className={`group flex cursor-grab items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40 active:cursor-grabbing ${idx > 0 ? 'border-t border-border' : ''} ${dropIndex === idx && dragId !== chap.id ? 'bg-primary/10' : ''}`}
          >
            <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">{idx + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{chap.title || t('steps:chapters.titlePlaceholder')}</div>
              <div className="truncate text-xs text-muted-foreground">
                {(chap.summary || '').slice(0, 60) || '—'}
                {(chap.content?.length ?? 0) > 0 && ` · ${(chap.content?.length ?? 0).toLocaleString()}字`}
              </div>
            </div>
            <div className="flex shrink-0 items-center">
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={idx === 0} onClick={() => moveChapter(chap.id, -1)} title={t('steps:chapters.moveUp')}>
                <ChevronUp className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={idx === chapters.length - 1} onClick={() => moveChapter(chap.id, 1)} title={t('steps:chapters.moveDown')}>
                <ChevronDown className="size-4" />
              </Button>
              {onExtractOutline && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  disabled={extractOutlineDisabled}
                  onClick={() => onExtractOutline(chap)}
                  title={t('steps:chapters.extractChapter')}
                >
                  <FileSearch className="size-3.5" />
                </Button>
              )}
              <Button size="sm" onClick={() => onEnterWriting(chap.id)}>
                <PenTool className="size-3.5" /> {t('steps:chapters.writeThis')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {chapters.map((chap, idx) => (
        <div
          key={chap.id}
          draggable
          onDragStart={(e) => { setDragId(chap.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropIndex !== idx) setDropIndex(idx); }}
          onDrop={(e) => { e.preventDefault(); if (dragId) moveChapterTo(dragId, idx); clearDragState(); }}
          onDragEnd={clearDragState}
          className={`group rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/30 ${dropIndex === idx && dragId !== chap.id ? 'border-primary/60 bg-primary/5' : ''}`}
        >
          <div className="mb-4 flex items-center gap-4 border-b border-border pb-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
              {idx + 1}
            </div>
            <div className="min-w-0 flex-1">
              <Input
                className="h-auto border-none bg-transparent p-0 font-serif text-base font-medium shadow-none focus-visible:ring-0"
                value={chap.title}
                onChange={(e) => {
                  onUpdate({ chapters: project.chapters.map(c => c.id === chap.id ? { ...c, title: e.target.value } : c) });
                }}
                placeholder={t('steps:chapters.titlePlaceholder')}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={idx === 0} onClick={() => moveChapter(chap.id, -1)} title={t('steps:chapters.moveUp')}>
                <ChevronUp className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={idx === chapters.length - 1} onClick={() => moveChapter(chap.id, 1)} title={t('steps:chapters.moveDown')}>
                <ChevronDown className="size-4" />
              </Button>
              {onExtractOutline && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  disabled={extractOutlineDisabled}
                  onClick={() => onExtractOutline(chap)}
                  title={t('steps:chapters.extractChapter')}
                >
                  <FileSearch className="size-3.5" />
                </Button>
              )}
              <Button size="sm" onClick={() => onEnterWriting(chap.id)}>
                <PenTool className="size-3.5" /> {t('steps:chapters.writeThis')}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={() => onUpdate({ chapters: project.chapters.filter(c => c.id !== chap.id) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mb-1">
            <Label className="mb-1.5 block text-2xs uppercase tracking-wider text-muted-foreground">{t('steps:chapters.summaryLabel')}</Label>
            <Textarea
              className="min-h-24 resize-none bg-muted/40 leading-relaxed"
              value={chap.summary}
              onChange={(e) => {
                onUpdate({ chapters: project.chapters.map(c => c.id === chap.id ? { ...c, summary: e.target.value } : c) });
              }}
              placeholder={t('steps:chapters.summaryPlaceholder')}
            />
          </div>

          {renderRelationEditor(chap)}
        </div>
      ))}
    </>
  );
};

export default ChapterOutlineList;
