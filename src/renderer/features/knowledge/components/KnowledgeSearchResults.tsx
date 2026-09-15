/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 知识库检索结果卡片：按混合/语义/关键词标注分数来源。
 */
import { X } from 'lucide-react';
import React from 'react';

import { useTranslation } from '@/i18n';
import { Card } from '@/shared/ui/Card';
import { cn } from '@/shared/utils/cn';
import { formatPercent } from '@/shared/utils/format';

import type { HybridSearchResult } from '../../../../shared/types';
import type { KnowledgeSearchMode } from './KnowledgeSearchBar';

interface KnowledgeSearchResultsProps {
  results: HybridSearchResult[];
  mode: KnowledgeSearchMode;
  /** 点击结果：回调知识库条目 id，由父级定位并打开详情。 */
  onOpen: (knowledgeItemId: string) => void;
  onClose: () => void;
}

export const KnowledgeSearchResults: React.FC<KnowledgeSearchResultsProps> = ({ results, mode, onOpen, onClose }) => {
  const { t } = useTranslation('knowledge');
  const modeLabel =
    mode === 'hybrid' ? t('center.searchModeHybrid') : mode === 'semantic' ? t('center.searchModeSemantic') : t('center.searchModeKeyword');

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 p-4">
        <h3 className="text-sm font-medium">
          {t('center.searchResultsTitle', { count: results.length })}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{modeLabel}</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('center.closeSearchResults')}
          className="touch-target text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {results.map((result) => (
          <div
            key={result.document.id}
            role="button"
            tabIndex={0}
            className="cursor-pointer border-b border-border p-4 transition-colors last:border-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={() => onOpen(result.document.knowledgeItemId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(result.document.knowledgeItemId);
              }
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-medium">
                  {result.metadata?.name || t('center.unnamedDoc')}
                  <span className="ml-2 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                    {result.metadata?.category || t('center.unknown')}
                  </span>
                </h4>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{result.content}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs tabular-nums text-muted-foreground">{formatPercent(result.combinedScore)}</div>
                <span
                  className={cn(
                    'mt-1 inline-block rounded px-1.5 py-0.5 text-xs',
                    result.semanticScore > result.keywordScore ? 'bg-chart-1/10 text-chart-1' : 'bg-chart-5/10 text-chart-5',
                  )}
                >
                  {result.semanticScore > result.keywordScore ? t('center.scoreSemantic') : t('center.scoreKeyword')}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
