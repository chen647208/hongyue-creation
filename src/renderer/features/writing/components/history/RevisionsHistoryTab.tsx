/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { RevisionEntity } from '@core/entities';
import { History, Redo2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';

import type { RevisionBaseline } from '../../../../editor/revisionDiff';
import { formatHistoryTimestamp } from '../../utils';

interface RevisionsHistoryTabProps {
  /** 修订记录（顶层按需加载，seq 倒序后下传）。 */
  revisions: RevisionEntity[];
  /** 以该修订为基线进入修订对比。 */
  onStartReview: (label: string, text: string, baseline: RevisionBaseline) => void;
  /** 应用该修订：顶层负责落快照、写回并关闭弹窗。 */
  onApplyRevision: (body: string) => void;
}

/** 修订 tab：修订记录的查看、应用与作为对比基线。 */
const RevisionsHistoryTab: React.FC<RevisionsHistoryTabProps> = ({ revisions, onStartReview, onApplyRevision }) => {
  const { t } = useTranslation('writing');

  if (revisions.length === 0) {
    return <EmptyState icon={History} title={t('chapterHistory.noRevisions')} description={t('chapterHistory.noRevisionsHint')} />;
  }

  return (
    <div className="space-y-3">
      {revisions.map((rev) => (
        <div key={rev.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">#{rev.seq}</span>
              <span>{formatHistoryTimestamp(rev.createdAt)}</span>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {t('chapterHistory.revisionAuthor')}: {rev.author}
              {rev.cause ? ` · ${t('chapterHistory.revisionCause')}: ${rev.cause}` : ''}
              {` · ${rev.body.slice(0, 60).replace(/\n/g, ' ') || t('chapterHistory.emptyPreview')}`}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStartReview(`#${rev.seq}`, rev.body, { source: 'revision', id: rev.id })}
              title={t('chapterHistory.compareAsBaselineTitle')}
            >
              <History className="size-3.5" /> {t('chapterHistory.compareAsBaseline')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => onApplyRevision(rev.body)}
              title={t('chapterHistory.revisionApplyTitle')}
            >
              <Redo2 className="size-3.5" /> {t('chapterHistory.revisionApply')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RevisionsHistoryTab;
