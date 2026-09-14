/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { AlignLeft, Check, Code, FileDown, FileOutput, FileText, Globe, type LucideIcon,Package } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { buildProfileRegistry, profileKey } from '@/shared/services/buildProfiles';
import { Button } from '@/shared/ui/Button';
import { DialogTitle } from '@/shared/ui/Dialog';
import MarkdownView from '@/shared/ui/Markdown';
import { ModalShell } from '@/shared/ui/ModalShell';
import { Select } from '@/shared/ui/Select';
import { cn } from '@/shared/utils/cn';

import type { Chapter, Project } from '../../../../shared/types';
import { computeChapterStats } from '../services/writingStatsService';
import type { ExportFormat } from '../types';
import { buildExportContent } from '../utils';

interface ExportChapterModalProps {
  isOpen: boolean;
  project: Project;
  chapters: Chapter[];
  selectedChapterIds: Set<string>;
  format: ExportFormat;
  exportProfileId: string;
  onExportProfileChange: (id: string) => void;
  onClose: () => void;
  onToggleAll: () => void;
  onToggleChapter: (chapterId: string) => void;
  onFormatChange: (format: ExportFormat) => void;
  onConfirm: () => void;
}

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; icon: LucideIcon }> = [
  { value: 'txt', label: 'TXT', icon: AlignLeft },
  { value: 'md', label: 'Markdown', icon: Code },
  { value: 'html', label: 'HTML', icon: Globe },
  { value: 'rtf', label: 'RTF', icon: FileText },
  { value: 'pdf', label: 'PDF', icon: FileDown },
  { value: 'epub', label: 'ePub', icon: Package },
  { value: 'docx', label: 'DOCX', icon: Package },
];

const ExportChapterModal: React.FC<ExportChapterModalProps> = ({
  isOpen,
  project,
  chapters,
  selectedChapterIds,
  format,
  exportProfileId,
  onExportProfileChange,
  onClose,
  onToggleAll,
  onToggleChapter,
  onFormatChange,
  onConfirm,
}) => {
  const { t } = useTranslation('writing');
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
  const [showPreview, setShowPreview] = useState(false);
  const profiles = buildProfileRegistry.list();
  const selectedProfile = profiles.find((p) => profileKey(p) === exportProfileId);
  const previewText = useMemo(
    // PDF/ePub/DOCX 预览复用 HTML 渲染（打印即所见）
    () => (showPreview ? buildExportContent(project, selectedChapterIds, format === 'pdf' || format === 'epub' || format === 'docx' ? 'html' : format, selectedProfile) : ''),
    [showPreview, project, selectedChapterIds, format, selectedProfile],
  );
  const previewStats = useMemo(() => (showPreview ? computeChapterStats(previewText) : null), [showPreview, previewText]);

  return (
    <ModalShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }} bare contentClassName="flex max-h-[85vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          <DialogTitle className="font-serif text-lg">{t('export.title')}</DialogTitle>
        </div>

        {profiles.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2">
            <span className="text-xs text-muted-foreground">{t('export.presetLabel')}</span>
            <Select
              value={exportProfileId}
              onChange={(e) => onExportProfileChange(e.target.value)}
              aria-label={t('export.presetLabel')}
              className="h-7 w-auto min-w-[160px] text-xs"
            >
              <option value="">{t('export.presetDefault')}</option>
              {profiles.map((p) => (
                <option key={profileKey(p)} value={profileKey(p)}>{p.name}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-3">
          <div className="text-sm text-muted-foreground">
            {t('export.selectedBefore')}
            <span className="font-medium tabular-nums text-foreground">{selectedChapterIds.size}</span>
            {t('export.selectedAfter', { total: chapters.length })}
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onFormatChange(opt.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  format === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                title={t('export.exportAsTitle', { format: opt.label })}
              >
                <opt.icon className="size-3.5" /> {opt.label}
              </button>
            ))}
          </div>
          <Button variant="link" size="sm" className="h-auto shrink-0 p-0 text-xs whitespace-nowrap" onClick={onToggleAll}>
            {selectedChapterIds.size === chapters.length ? t('export.deselectAll') : t('export.selectAll')}
          </Button>
          <Button variant="link" size="sm" className="h-auto shrink-0 p-0 text-xs whitespace-nowrap" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? t('export.previewHide') : t('export.previewShow')}
          </Button>
        </div>

        <div className=" flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
          {sortedChapters.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t('export.noChapters')}</div>
          ) : (
            sortedChapters.map((chapter) => {
              const isSelected = selectedChapterIds.has(chapter.id);
              const wordLength = (chapter.content || '').length;

              return (
                <div
                  key={chapter.id}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => onToggleChapter(chapter.id)}
                  onKeyDown={(event) => {
                    if (event.key === ' ' || event.key === 'Enter') {
                      event.preventDefault();
                      onToggleChapter(chapter.id);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors select-none',
                    isSelected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:bg-accent/40'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                      isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'
                    )}
                  >
                    {isSelected && <Check className="size-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className={cn('flex items-center gap-1.5 truncate text-sm', isSelected ? 'font-medium text-foreground' : 'text-foreground/80')}>
                      <span className="truncate">{t('export.chapterEntry', { num: chapter.order + 1, title: chapter.title })}</span>
                      {chapter.material && (
                        <span className="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-2xs text-primary">{t('navigation.materialBadge')}</span>
                      )}
                    </h4>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{t('export.wordCountLabel', { count: wordLength })}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {showPreview && (
          <div className="flex min-h-0 flex-1 flex-col border-t border-border">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-2 text-xs text-muted-foreground">
              <span>{t('export.previewTitle')}</span>
              {previewStats && <span className="tabular-nums">{t('export.previewCharCount', { count: previewStats.charCount })}</span>}
            </div>
            <div className=" min-h-0 flex-1 overflow-auto bg-background p-4">
              {format === 'html' ? (
                <iframe title="preview" srcDoc={previewText} className="h-80 w-full rounded-md border border-border bg-white" />
              ) : format === 'md' ? (
                <MarkdownView content={previewText} />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-7">{previewText}</pre>
              )}
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4">
          <Button variant="ghost" onClick={onClose}>{t('export.cancel')}</Button>
          <Button onClick={onConfirm}>
            <FileOutput className="size-4" /> {t('export.confirmExport', { format: format.toUpperCase() })}
          </Button>
        </div>
    </ModalShell>
  );
};

export default ExportChapterModal;
