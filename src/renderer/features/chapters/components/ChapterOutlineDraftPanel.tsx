/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 从正文提取的细纲草稿预览面板：逐条可编辑、勾选后确认写入；已有细纲的章节只读跳过。 */
import { Check, FileSearch, X } from 'lucide-react';
import React, { useEffect,useMemo,useState } from 'react';

import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Textarea } from '@/shared/ui/Textarea';

import { type Chapter, type TokenUsage } from '../../../../shared/types';
import { applyDraftEdits, type OutlineDraft } from '../services/chapterOutline';

export interface ChapterOutlineDraftPanelProps {
  drafts: OutlineDraft[];
  chapters: Chapter[];
  tokens?: TokenUsage;
  /** 分批提取进度（已完成/总批次）；缺省不显示。 */
  batchProgress?: { done: number; total: number };
  /** 确认应用选中的（可能已逐条编辑的）草稿；只写空白细纲。 */
  onApply: (selectedIds: Set<string>, drafts: OutlineDraft[]) => void;
  onDiscard: () => void;
  /** 上一轮失败后剩余批次可续提；缺省不显示续提入口。 */
  onContinue?: () => void;
  continueDisabled?: boolean;
}

export const ChapterOutlineDraftPanel: React.FC<ChapterOutlineDraftPanelProps> = ({
  drafts,
  chapters,
  tokens,
  batchProgress,
  onApply,
  onDiscard,
  onContinue,
  continueDisabled,
}) => {
  const { t } = useTranslation(['steps', 'common']);
  const summaryById = useMemo(
    () => new Map(chapters.map((c) => [c.id, (c.summary ?? '').trim()])),
    [chapters],
  );
  const applicableIds = useMemo(
    () => drafts.filter((d) => !summaryById.get(d.chapterId)).map((d) => d.chapterId),
    [drafts, summaryById],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(applicableIds));
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelected(new Set(applicableIds));
  }, [applicableIds]);

  // 新一批草稿到达时丢弃上一批的逐条编辑，避免张冠李戴。
  useEffect(() => {
    setEdits({});
  }, [drafts]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card className="shrink-0 space-y-3 border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <FileSearch className="size-3.5" /> {t('steps:chapters.draftTitle')}
        </span>
        <div className="flex items-center gap-2">
          {batchProgress && batchProgress.total > 1 ? (
            <span className="text-2xs tabular-nums text-muted-foreground">
              {t('steps:chapters.extractBatchProgress', { done: batchProgress.done, total: batchProgress.total })}
            </span>
          ) : null}
          {tokens && tokens.total > 0 ? (
            <span className="text-2xs tabular-nums text-muted-foreground">
              {t('steps:chapters.totalLabel')} {tokens.total}
            </span>
          ) : null}
          {onContinue ? (
            <Button size="sm" variant="outline" onClick={onContinue} disabled={continueDisabled}>
              <FileSearch className="size-3.5" /> {t('steps:chapters.extractContinue')}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => onApply(selected, applyDraftEdits(drafts, edits))} disabled={selected.size === 0}>
            <Check className="size-3.5" /> {t('steps:chapters.draftApply')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            <X className="size-3.5" /> {t('steps:chapters.draftDiscard')}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t('steps:chapters.draftHint')}</p>

      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {drafts.map((d) => {
          const skipped = Boolean(summaryById.get(d.chapterId));
          const value = edits[d.chapterId] ?? d.summary;
          return (
            <div key={d.chapterId} className="flex gap-2 rounded-md border border-border bg-background/60 p-2.5">
              <Checkbox
                checked={selected.has(d.chapterId)}
                disabled={skipped}
                onChange={() => toggle(d.chapterId)}
                aria-label={t('steps:chapters.extractChapter')}
                className="mt-0.5 size-3.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="truncate">
                    {t('steps:chapters.defaultChapterTitle', { num: d.order + 1 })} · {d.title}
                  </span>
                  {skipped && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-2xs font-normal text-muted-foreground">
                      {t('steps:chapters.draftSkipped')}
                    </span>
                  )}
                </div>
                <Textarea
                  value={value}
                  disabled={skipped}
                  aria-label={t('steps:chapters.draftEditLabel')}
                  onChange={(event) => setEdits((prev) => ({ ...prev, [d.chapterId]: event.target.value }))}
                  className="mt-1 min-h-[56px] resize-y bg-muted/40 text-xs leading-relaxed"
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default ChapterOutlineDraftPanel;
