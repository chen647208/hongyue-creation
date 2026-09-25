/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Camera, History, RotateCcw, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { removeSnapshot } from '@/shared/services/chapterSnapshotService';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { cn } from '@/shared/utils/cn';

import type { Chapter, ChapterSnapshot } from '../../../../../shared/types';
import type { RevisionBaseline } from '../../../../editor/revisionDiff';
import { formatHistoryTimestamp } from '../../utils';

const DEFAULT_SOURCE_CLS = 'bg-muted text-muted-foreground';
const MANUAL_SOURCE_CLS = 'bg-chart-2/10 text-chart-2';
const BEFORE_CLEAR_SOURCE_CLS = 'bg-destructive/10 text-destructive';

interface SnapshotHistoryTabProps {
  chapter: Chapter;
  /** 章节快照（顶层经 listSnapshots 取好后下传）。 */
  snapshots: ChapterSnapshot[];
  /** 以该快照为基线进入修订对比。 */
  onStartReview: (label: string, text: string, baseline: RevisionBaseline) => void;
  /** 恢复该快照：顶层负责落快照、写回并关闭弹窗。 */
  onRestore: (content: string) => void;
  /** 删除快照写回；缺省（旧调用方）不渲染删除按钮。 */
  onUpdateChapter?: (chapter: Chapter) => void;
}

/** 快照 tab：章节快照的查看、恢复、删除与作为对比基线。 */
const SnapshotHistoryTab: React.FC<SnapshotHistoryTabProps> = ({ chapter, snapshots, onStartReview, onRestore, onUpdateChapter }) => {
  const { t } = useTranslation('writing');
  const sourceLabels: Record<string, { text: string; cls: string }> = {
    auto: { text: t('chapterHistory.sourceAuto'), cls: DEFAULT_SOURCE_CLS },
    manual: { text: t('chapterHistory.sourceManual'), cls: MANUAL_SOURCE_CLS },
    'before-clear': { text: t('chapterHistory.sourceBeforeClear'), cls: BEFORE_CLEAR_SOURCE_CLS },
    'before-rollback': { text: t('chapterHistory.sourceBeforeRollback'), cls: BEFORE_CLEAR_SOURCE_CLS },
  };
  const fallbackSourceLabel = { text: t('chapterHistory.sourceAuto'), cls: DEFAULT_SOURCE_CLS };

  if (snapshots.length === 0) {
    return <EmptyState icon={Camera} title={t('chapterHistory.noSnapshots')} description={t('chapterHistory.noSnapshotsHint')} />;
  }

  return (
    <>
      {snapshots.map((snap) => {
        const label = sourceLabels[snap.source] ?? fallbackSourceLabel;
        return (
          <div key={snap.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs font-medium', label.cls)}>{label.text}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{formatHistoryTimestamp(snap.timestamp)}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {t('chapterHistory.charCountInfo', { count: snap.charCount, preview: snap.content.slice(0, 40).replace(/\n/g, ' ') || t('chapterHistory.emptyPreview') })}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStartReview(formatHistoryTimestamp(snap.timestamp), snap.content, { source: 'snapshot', id: snap.id })}
                title={t('chapterHistory.compareAsBaselineTitle')}
              >
                <History className="size-3.5" /> {t('chapterHistory.compareAsBaseline')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onRestore(snap.content)} title={t('chapterHistory.restoreTitle')}>
                <RotateCcw className="size-3.5" /> {t('chapterHistory.restore')}
              </Button>
              {onUpdateChapter && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onUpdateChapter(removeSnapshot(chapter, snap.id))}
                  title={t('chapterHistory.deleteSnapshotTitle')}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default SnapshotHistoryTab;
