/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { PlusCircle } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useTranslation } from '@/i18n';
import { Select } from '@/shared/ui/Select';

import { isModelConfigured } from '../../../shared/utils/modelReadiness';
import type { ModelSettingsPanelProps } from '../types';
import { isProviderEnabled } from '../utils/providerHealth';
import ProviderEditor from './ProviderEditor';
import ProviderSidebar, { type ProviderFilter } from './ProviderSidebar';
import UsageSummaryCard from './UsageSummaryCard';

/**
 * 模型渠道设置：左侧列表 + 右侧单渠道编辑（Cherry Studio 式）。
 * 原来堆叠全部卡片的写法一次暴露 N 个 endpoint/key/高级参数，认知负荷高；
 * 现在一次只编辑一个，列表负责搜索/过滤/状态，编辑器负责三步连通。
 */
const ModelSettingsPanel: React.FC<ModelSettingsPanelProps> = ({
  localModels,
  activeId,
  setActiveId,
  testingId,
  testResults,
  modelListLoading,
  removeModel,
  updateModel,
  testModel,
  fetchModelList,
  addModel,
}) => {
  const { t } = useTranslation('settings');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProviderFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(activeId ?? localModels[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return localModels.filter((m) => {
      if (filter === 'enabled' && !isProviderEnabled(m)) return false;
      if (filter === 'disabled' && isProviderEnabled(m)) return false;
      if (filter === 'unconfigured' && isModelConfigured(m)) return false;
      if (!q) return true;
      return `${m.name} ${m.modelName} ${m.endpoint ?? ''}`.toLowerCase().includes(q);
    });
  }, [localModels, query, filter]);

  const selected = localModels.find((m) => m.id === (selectedId ?? activeId ?? localModels[0]?.id)) ?? filtered[0] ?? localModels[0];

  return (
    <div className="space-y-3">
      {/* 窄屏收起侧栏：用下拉框选渠道，避免侧栏与编辑器挤成一团 */}
      <div className="md:hidden">
        <Select
          aria-label={t('models.selectProviderLabel')}
          value={selected?.id ?? ''}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {localModels.length === 0 && <option value="">{t('models.emptyAll', '还没有渠道，先添加一个')}</option>}
          {localModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </div>
      <div className="flex gap-5">
        <ProviderSidebar
        models={filtered}
        selectedId={selected?.id ?? null}
        activeId={activeId}
        query={query}
        filter={filter}
        onQuery={setQuery}
        onFilter={setFilter}
        onSelect={setSelectedId}
        testResults={testResults}
      />
      <div className="min-w-0 flex-1 space-y-5">
        {selected ? (
          <ProviderEditor
            model={selected}
            active={activeId === selected.id}
            testing={testingId === selected.id}
            testResult={testResults[selected.id]}
            listLoading={Boolean(modelListLoading[selected.id])}
            onSetActive={() => { setActiveId(selected.id); setSelectedId(selected.id); }}
            onRemove={() => removeModel(selected.id)}
            onUpdate={(updates) => updateModel(selected.id, updates)}
            onTest={() => testModel(selected)}
            onFetchList={() => fetchModelList(selected)}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t('models.emptyAll', '还没有渠道，先添加一个')}
          </div>
        )}
        <button
          onClick={() => { addModel(); }}
          className="group flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border py-6 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/30 hover:text-primary"
        >
          <PlusCircle className="size-5 transition-transform group-hover:scale-110" />
          <span>{t('models.addProvider')}</span>
        </button>
        <UsageSummaryCard />
      </div>
      </div>
    </div>
  );
};

export default ModelSettingsPanel;
