/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 知识库检索栏：输入 + 检索模式切换 + 图例（知识库中心头部）。 */
import { Bot, Brain, Search } from 'lucide-react';
import React from 'react';

import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Spinner } from '@/shared/ui/Spinner';
import { cn } from '@/shared/utils/cn';

export type KnowledgeSearchMode = 'keyword' | 'semantic' | 'hybrid';

interface KnowledgeSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  isSearching: boolean;
  mode: KnowledgeSearchMode;
  onModeChange: (mode: KnowledgeSearchMode) => void;
}

export const KnowledgeSearchBar: React.FC<KnowledgeSearchBarProps> = ({
  value,
  onChange,
  onSearch,
  isSearching,
  mode,
  onModeChange,
}) => {
  const { t } = useTranslation('knowledge');
  const modes = [
    { mode: 'hybrid' as const, icon: Bot, title: t('center.hybridTitle'), label: t('center.modeHybrid') },
    { mode: 'semantic' as const, icon: Brain, title: t('center.semanticTitle'), label: t('center.modeSemantic') },
    { mode: 'keyword' as const, icon: Search, title: t('center.keywordTitle'), label: t('center.modeKeyword') },
  ];

  return (
    <div className="mt-6">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSearching && value.trim()) onSearch();
            }}
            placeholder={t('center.searchPlaceholder')}
            className="pr-28"
          />
          <Button
            size="sm"
            onClick={onSearch}
            disabled={isSearching || !value.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          >
            {isSearching ? <Spinner className="size-3.5" /> : <Search className="size-3.5" />}
            {isSearching ? t('center.searching') : t('center.search')}
          </Button>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {modes.map(({ mode: itemMode, icon: Icon, title, label }) => (
            <button
              key={itemMode}
              onClick={() => onModeChange(itemMode)}
              title={title}
              className={cn(
                'touch-target flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                mode === itemMode
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" />
          {t('center.hybridLegend')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-1" />
          {t('center.semanticLegend')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-chart-5" />
          {t('center.keywordLegend')}
        </span>
      </div>
    </div>
  );
};
