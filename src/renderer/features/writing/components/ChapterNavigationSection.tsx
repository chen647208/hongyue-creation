/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import { Bookmark, CheckSquare, ChevronRight, LayoutGrid, List, Square, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useViewPreference } from '@/shared/hooks/useViewPreference';
import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Input } from '@/shared/ui/Input';
import { ViewModeToggle } from '@/shared/ui/ViewModeToggle';
import { cn } from '@/shared/utils/cn';

import type { Chapter } from '../../../../shared/types';
import type { ChapterNavigationSectionProps } from '../types';

const STATUS_ORDER: Array<NonNullable<Chapter['status']>> = ['draft', 'writing', 'done'];

const statusTone: Record<NonNullable<Chapter['status']>, string> = {
  draft: 'bg-muted-foreground/40',
  writing: 'bg-primary',
  done: 'bg-success',
  final: 'bg-foreground',
};

const statusLabelKey = {
  draft: 'navigation.status.draft',
  writing: 'navigation.status.writing',
  done: 'navigation.status.done',
  final: 'navigation.status.final',
} as const;

const ChapterNavigationSection: React.FC<ChapterNavigationSectionProps> = ({
  chapters,
  activeChapterId,
  onChapterClick,
  onDeleteChapter,
  onChaptersChange,
  onBatchDeleteChapter,
}) => {
  const { t } = useTranslation('writing');
  const [query, setQuery] = useState('');
  const [view, setView] = useViewPreference<'list' | 'cards'>('writing.navView', 'list');
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const visible = chapters
    .slice()
    .sort((firstChapter, secondChapter) => firstChapter.order - secondChapter.order)
    .filter((chapter) => !q || chapter.title.toLowerCase().includes(q));

  const cycleStatus = (chapter: Chapter) => {
    const current = chapter.status ?? 'draft';
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length] ?? current;
    onChaptersChange(chapters.map((c) => (c.id === chapter.id ? { ...c, status: next } : c)));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markSelected = (status: NonNullable<Chapter['status']>) => {
    if (selectedIds.size === 0) return;
    onChaptersChange(chapters.map((c) => (selectedIds.has(c.id) ? { ...c, status } : c)));
    setSelectedIds(new Set());
  };

  const toggleMaterial = (chapter: Chapter) => {
    onChaptersChange(chapters.map((c) => (c.id === chapter.id ? { ...c, material: !c.material } : c)));
  };

  const markSelectedMaterial = (material: boolean) => {
    if (selectedIds.size === 0) return;
    onChaptersChange(chapters.map((c) => (selectedIds.has(c.id) ? { ...c, material } : c)));
    setSelectedIds(new Set());
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ok = await dialogService.confirm({
      message: t('navigation.deleteSelectedConfirm', { count: selectedIds.size }),
      danger: true,
    });
    if (!ok) return;
    onBatchDeleteChapter([...selectedIds]);
    setSelectedIds(new Set());
  };

  const statusOf = (chapter: Chapter): NonNullable<Chapter['status']> => chapter.status ?? 'draft';

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('navigation.title')}</h4>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-6 text-muted-foreground', selecting && 'bg-accent text-foreground')}
            onClick={() => {
              setSelecting((v) => !v);
              setSelectedIds(new Set());
            }}
            title={t('navigation.selectTitle')}
          >
            {selecting ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
          </Button>
          <ViewModeToggle
            value={view}
            onChange={setView}
            options={[
              { value: 'list', icon: List, title: t('navigation.viewList') },
              { value: 'cards', icon: LayoutGrid, title: t('navigation.viewCards') },
            ]}
          />
        </div>
      </div>
      {chapters.length > 5 && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('navigation.searchPlaceholder')}
          className="mb-2 h-8 text-xs"
        />
      )}
      {selecting && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-2xs tabular-nums text-muted-foreground">
            {t('navigation.selectedCount', { count: selectedIds.size })}
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={() => setSelectedIds(new Set(visible.map((c) => c.id)))}>
            {t('navigation.selectAll')}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={() => markSelected('done')} disabled={selectedIds.size === 0}>
            {t('navigation.markDone')}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={() => markSelected('draft')} disabled={selectedIds.size === 0}>
            {t('navigation.markDraft')}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={() => markSelectedMaterial(true)} disabled={selectedIds.size === 0}>
            {t('navigation.markMaterial')}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={() => markSelectedMaterial(false)} disabled={selectedIds.size === 0}>
            {t('navigation.unmarkMaterial')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-2xs text-muted-foreground hover:text-destructive"
            onClick={() => void deleteSelected()}
            disabled={selectedIds.size === 0}
          >
            {t('navigation.deleteSelected')}
          </Button>
        </div>
      )}
      {view === 'list' ? (
        <div className="space-y-1">
          {visible.map((chapter) => (
            <div
              key={chapter.id}
              onClick={() => onChapterClick(chapter)}
              className={cn(
                'group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs transition-colors',
                activeChapterId === chapter.id
                  ? 'bg-primary/5 font-medium text-foreground ring-1 ring-inset ring-primary/40'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {selecting && (
                  <Checkbox
                    checked={selectedIds.has(chapter.id)}
                    onChange={() => toggleSelect(chapter.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="size-3.5 shrink-0"
                  />
                )}
                <button
                  type="button"
                  title={t('navigation.statusCycleTitle')}
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleStatus(chapter);
                  }}
                  className={cn('size-2 shrink-0 rounded-full', statusTone[statusOf(chapter)])}
                />
                <span className="flex-1 truncate">{t('navigation.chapterEntry', { num: chapter.order + 1, title: chapter.title })}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'size-6 shrink-0',
                  chapter.material ? 'text-primary' : 'text-muted-foreground opacity-0 group-hover:opacity-100'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMaterial(chapter);
                }}
                title={chapter.material ? t('navigation.unmarkMaterialTitle') : t('navigation.markMaterialTitle')}
                aria-pressed={Boolean(chapter.material)}
              >
                <Bookmark className={cn('size-3.5', chapter.material && 'fill-current')} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChapter(chapter.id);
                }}
                title={t('navigation.deleteTitle', { title: chapter.title })}
              >
                <Trash2 className="size-3.5" />
              </Button>
              {activeChapterId !== chapter.id && <ChevronRight className="size-3 opacity-0 transition-opacity group-hover:opacity-50" />}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {visible.map((chapter) => (
            <div
              key={chapter.id}
              onClick={() => onChapterClick(chapter)}
              className={cn(
                'group cursor-pointer rounded-lg border p-3 transition-colors',
                activeChapterId === chapter.id
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-card hover:bg-accent/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-serif text-sm font-medium text-foreground">
                  {t('navigation.chapterEntry', { num: chapter.order + 1, title: chapter.title })}
                </span>
                <span className={cn('size-2 shrink-0 rounded-full', statusTone[statusOf(chapter)])} title={t(statusLabelKey[statusOf(chapter)])} />
              </div>
              <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-muted-foreground">
                {chapter.contentSummary || chapter.summary || t('navigation.noSummary')}
              </p>
              <div className="mt-2 flex items-center justify-between text-2xs tabular-nums text-muted-foreground">
                <span>
                  {chapter.material && <span className="mr-1 rounded bg-primary/10 px-1 py-0.5 text-primary">{t('navigation.materialBadge')}</span>}
                  {t(statusLabelKey[statusOf(chapter)])} · {(chapter.content || '').length}{t('navigation.charsUnit')}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('size-6', chapter.material ? 'text-primary' : 'text-muted-foreground opacity-0 group-hover:opacity-100')}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMaterial(chapter);
                    }}
                    title={chapter.material ? t('navigation.unmarkMaterialTitle') : t('navigation.markMaterialTitle')}
                    aria-pressed={Boolean(chapter.material)}
                  >
                    <Bookmark className={cn('size-3.5', chapter.material && 'fill-current')} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChapter(chapter.id);
                    }}
                    title={t('navigation.deleteTitle', { title: chapter.title })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default ChapterNavigationSection;
