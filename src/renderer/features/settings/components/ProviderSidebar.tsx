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

import type { ProviderConfig, ResolvedModelConfig } from '../../../../shared/types';
import { findProviderPreset } from '../../../constants/modelProviders';
import { channelValueFor } from '../utils/channelPreset';

export type ProviderFilter = 'all' | 'enabled' | 'disabled' | 'unconfigured';

interface ProviderSidebarProps {
  providers: ProviderConfig[];
  models: ResolvedModelConfig[];
  selectedId: string | null;
  activeId: string | null;
  query: string;
  filter: ProviderFilter;
  onQuery: (q: string) => void;
  onFilter: (f: ProviderFilter) => void;
  onSelect: (id: string) => void;
  testResults: Record<string, string>;
}

function statusDot(testResult: string | undefined): React.ReactNode {
  if (testResult?.startsWith('[ERROR]')) return <AlertCircle className="size-3.5 shrink-0 text-destructive" />;
  if (testResult && !testResult.startsWith('[ERROR]')) return <CheckCircle2 className="size-3.5 shrink-0 text-success" />;
  return <span className="size-2 shrink-0 rounded-full bg-muted-foreground/30" />;
}

/**
 * 左侧供应商列表：搜索 + 过滤 + 状态点 + 供应商名与模型数，一次只选一个在右侧编辑。
 * 过滤的「启用/未启用」按该供应商下是否存在已启用模型判定。
 */
export const ProviderSidebar: React.FC<ProviderSidebarProps> = ({
  providers, models, selectedId, activeId, query, filter, onQuery, onFilter, onSelect, testResults,
}) => {
  const { t } = useTranslation('settings');

  const filtered = providers.filter((provider) => {
    const own = models.filter((m) => m.providerId === provider.id);
    const anyEnabled = own.some((m) => m.isEnabled !== false);
    if (filter === 'enabled' && !anyEnabled) return false;
    if (filter === 'disabled' && anyEnabled) return false;
    if (filter === 'unconfigured' && own.some((m) => m.modelName.trim())) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${provider.name} ${provider.endpoint ?? ''} ${own.map((m) => m.modelName).join(' ')}`.toLowerCase().includes(q);
  });

  return (
    <div className="hidden w-64 shrink-0 flex-col gap-3 md:flex">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8 text-xs"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t('models.searchPlaceholder', '搜索供应商 / 模型…')}
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
      <div className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1 pb-1">
        {filtered.map((provider) => {
          const preset = findProviderPreset(channelValueFor(provider));
          const selected = selectedId === provider.id;
          const own = models.filter((m) => m.providerId === provider.id);
          const activeHere = own.some((m) => m.id === activeId);
          return (
            <button
              key={provider.id}
              onClick={() => onSelect(provider.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                selected ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-accent/50'
              )}
            >
              {statusDot(testResults[provider.id])}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {provider.name || t('models.namePlaceholder')}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {preset ? dt(preset.nameKey) : provider.provider}
                  {` · ${t('models.modelCount', '{{count}} 个模型', { count: own.length })}`}
                  {activeHere && ` · ${t('models.activeBadge')}`}
                </span>
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {t('models.emptyFilter', '没有匹配的供应商，换个关键词试试')}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderSidebar;
