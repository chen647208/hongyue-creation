/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { AlertCircle, CheckCircle2, Search } from 'lucide-react';
import React from 'react';

import { useTranslation } from '@/i18n';
import { dt } from '@/i18n';
import { Input } from '@/shared/ui/Input';
import { SegmentedControl } from '@/shared/ui/ViewModeToggle';
import { cn } from '@/shared/utils/cn';

import type { ModelConfig } from '../../../../shared/types';
import { findProviderPreset } from '../../../constants/modelProviders';
import { channelValueFor } from '../utils/channelPreset';
import { isProviderEnabled } from '../utils/providerHealth';

export type ProviderFilter = 'all' | 'enabled' | 'disabled' | 'unconfigured';

interface ProviderSidebarProps {
  models: ModelConfig[];
  selectedId: string | null;
  activeId: string | null;
  query: string;
  filter: ProviderFilter;
  onQuery: (q: string) => void;
  onFilter: (f: ProviderFilter) => void;
  onSelect: (id: string) => void;
  testResults: Record<string, string>;
}

function statusDot(model: ModelConfig, testResult: string | undefined): React.ReactNode {
  if (testResult?.startsWith('[ERROR]')) return <AlertCircle className="size-3.5 shrink-0 text-destructive" />;
  if (testResult && !testResult.startsWith('[ERROR]')) return <CheckCircle2 className="size-3.5 shrink-0 text-success" />;
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        isProviderEnabled(model) ? 'bg-success' : 'bg-muted-foreground/30'
      )}
    />
  );
}

/**
 * 左侧 Provider 列表（对标 Cherry Studio ProviderList）：
 * 搜索 + 启用/未启用/未配置过滤 + 状态点 + 渠道名，一次只选一个在右侧编辑。
 */
export const ProviderSidebar: React.FC<ProviderSidebarProps> = ({
  models, selectedId, activeId, query, filter, onQuery, onFilter, onSelect, testResults,
}) => {
  const { t } = useTranslation('settings');
  return (
    <div className="hidden w-64 shrink-0 flex-col gap-3 md:flex">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8 text-xs"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t('models.searchPlaceholder', '搜索渠道 / 模型…')}
        />
      </div>
      <SegmentedControl
        value={filter}
        onChange={onFilter}
        size="sm"
        options={(['all', 'enabled', 'disabled', 'unconfigured'] as ProviderFilter[]).map((f) => ({
          value: f,
          label: t(`models.filter.${f}`, f),
        }))}
      />
      <div className=" -mx-1 flex-1 space-y-1 overflow-y-auto px-1 pb-1">
        {models.map((model) => {
          const preset = findProviderPreset(channelValueFor(model));
          const selected = selectedId === model.id;
          const enabled = isProviderEnabled(model);
          return (
            <button
              key={model.id}
              onClick={() => onSelect(model.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                selected ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-accent/50'
              )}
            >
              {statusDot(model, testResults[model.id])}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {model.name || t('models.namePlaceholder')}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {preset ? dt(preset.nameKey) : model.provider}
                  {model.modelName ? ` · ${model.modelName}` : ''}
                  {!enabled && ` · ${t('models.disabled', '已停用')}`}
                  {model.id === activeId && ` · ${t('models.activeBadge')}`}
                </span>
              </span>
            </button>
          );
        })}
        {models.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {t('models.emptyFilter', '没有匹配的渠道，换个关键词试试')}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderSidebar;
