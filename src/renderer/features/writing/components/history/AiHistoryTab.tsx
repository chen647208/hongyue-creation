/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Copy, History, Redo2 } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { cn } from '@/shared/utils/cn';

import type { AIHistoryRecord, Chapter } from '../../../../../shared/types';
import { diffLines } from '../../services/historyDiff';
import { formatHistoryTimestamp, getGenerationType, getProviderIcon } from '../../utils';

interface AiHistoryTabProps {
  chapter: Chapter;
  /** 时间倒序的 AI 生成历史（顶层排好后下传）。 */
  history: AIHistoryRecord[];
  /** 应用某条生成结果：顶层负责落快照、写回并关闭弹窗。 */
  onApply: (content: string) => void;
}

/** 历史记录 tab：AI 生成记录的查看、对比、复制与重新应用。 */
const AiHistoryTab: React.FC<AiHistoryTabProps> = ({ chapter, history, onApply }) => {
  const { t } = useTranslation('writing');
  // diff 对比目标记录 id（与当前正文逐行比对，只读展示）
  const [diffRecordId, setDiffRecordId] = useState<string | null>(null);

  if (history.length === 0) {
    return <EmptyState icon={History} title={t('chapterHistory.noHistory')} description={t('chapterHistory.noHistoryHint')} />;
  }

  return (
    <div className="space-y-4">
      {history.map((record) => (
        <div key={record.id} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              {(() => { const { icon: PIcon, cls } = getProviderIcon(record.modelConfig.provider); return <PIcon className={cn('size-5', cls)} />; })()}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{record.modelConfig.modelName}</span>
                  <span className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
                    {getGenerationType(record)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {record.metadata?.templateName || t('chapterHistory.customGeneration')}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-medium text-foreground">{formatHistoryTimestamp(record.timestamp)}</div>
              <div className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
                {record.tokens ? `${record.tokens.total} tokens` : 'N/A tokens'}
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('chapterHistory.promptLabel')}</div>
              <div className=" max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground/80">
                {record.prompt}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('chapterHistory.contentLabel')}</div>
              <div className=" max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-primary/20 bg-primary/5 p-3 font-serif text-sm leading-relaxed text-foreground">
                {record.generatedContent}
              </div>
              <div className="mt-1.5 text-right text-xs tabular-nums text-muted-foreground">
                {t('chapterHistory.lengthInfo', { count: record.generatedContent.length })}
              </div>
            </div>

            {diffRecordId === record.id && (
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('chapterHistory.diffLabel')}</div>
                <div className=" max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                  {diffLines(record.generatedContent, chapter.content || '').map((line, i) => (
                    <div
                      key={i}
                      className={cn(
                        'whitespace-pre-wrap rounded px-1.5 py-0.5',
                        line.type === 'add' && 'bg-success/10 text-success',
                        line.type === 'del' && 'bg-destructive/10 text-destructive',
                        line.type === 'same' && 'text-muted-foreground'
                      )}
                    >
                      {line.type === 'add' ? '+ ' : line.type === 'del' ? '- ' : '  '}{line.text || ' '}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('chapterHistory.modelConfigLabel')}</div>
                <div className="space-y-1">
                  <div className="text-sm text-foreground/80">
                    <span className="font-medium">{t('chapterHistory.providerLabel')}</span> {record.modelConfig.provider}
                  </div>
                  {record.modelConfig.temperature !== undefined && (
                    <div className="text-sm text-foreground/80">
                      <span className="font-medium">{t('chapterHistory.temperatureLabel')}</span> {record.modelConfig.temperature}
                    </div>
                  )}
                  {record.modelConfig.maxTokens !== undefined && (
                    <div className="text-sm text-foreground/80">
                      <span className="font-medium">{t('chapterHistory.maxTokensLabel')}</span> {record.modelConfig.maxTokens}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('record.tokenUsage')}</div>
                <div className="space-y-1">
                  <div className="text-sm tabular-nums text-foreground/80"><span className="font-medium">{t('chapterHistory.inputLabel')}</span> {record.tokens?.prompt || 'N/A'}</div>
                  <div className="text-sm tabular-nums text-foreground/80"><span className="font-medium">{t('chapterHistory.outputLabel')}</span> {record.tokens?.completion || 'N/A'}</div>
                  <div className="text-sm tabular-nums text-foreground/80"><span className="font-medium">{t('chapterHistory.totalLabel')}</span> {record.tokens?.total || 'N/A'}</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDiffRecordId((v) => (v === record.id ? null : record.id))}
              >
                {t('chapterHistory.compare')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(record.generatedContent);
                  dialogService.alert(t('record.copied'));
                }}
              >
                <Copy className="size-3.5" /> {t('record.copyContent')}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => onApply(record.generatedContent)}
              >
                <Redo2 className="size-3.5" /> {t('chapterHistory.reapply')}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AiHistoryTab;
