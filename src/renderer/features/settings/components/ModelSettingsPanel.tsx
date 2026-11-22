/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { PlusCircle } from 'lucide-react';
import React, { useState } from 'react';

import { useTranslation } from '@/i18n';
import { Select } from '@/shared/ui/Select';

import type { ModelSettingsPanelProps } from '../types';
import ProviderEditor from './ProviderEditor';
import ProviderSidebar, { type ProviderFilter } from './ProviderSidebar';
import UsageSummaryCard from './UsageSummaryCard';

/**
 * 模型设置：左侧供应商列表 + 右侧单供应商编辑（Cherry Studio 式）。
 * 一个供应商只填一次地址与 Key，下面可挂多个模型；模型各自启停、参数与价格独立。
 */
const ModelSettingsPanel: React.FC<ModelSettingsPanelProps> = ({
  localProviders,
  localModels,
  activeId,
  setActiveId,
  testingId,
  testResults,
  modelListLoading,
  addProvider,
  removeProvider,
  updateProvider,
  addModel,
  removeModel,
  updateModel,
  testProvider,
  fetchModelList,
}) => {
  const { t } = useTranslation('settings');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProviderFilter>('all');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(localProviders[0]?.id ?? null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const selectedProvider = localProviders.find((p) => p.id === selectedProviderId) ?? localProviders[0];
  const providerModels = selectedProvider ? localModels.filter((m) => m.providerId === selectedProvider.id) : [];

  return (
    <div className="space-y-3">
      <div className="md:hidden">
        <Select
          aria-label={t('models.selectProviderLabel')}
          value={selectedProvider?.id ?? ''}
          onChange={(e) => setSelectedProviderId(e.target.value)}
        >
          {localProviders.length === 0 && <option value="">{t('models.emptyAll', '还没有供应商，先添加一个')}</option>}
          {localProviders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </div>
      <div className="flex gap-5">
        <ProviderSidebar
          providers={localProviders}
          models={localModels}
          selectedId={selectedProvider?.id ?? null}
          activeId={activeId}
          query={query}
          filter={filter}
          onQuery={setQuery}
          onFilter={setFilter}
          onSelect={setSelectedProviderId}
          testResults={testResults}
        />
        <div className="min-w-0 flex-1 space-y-5">
          {selectedProvider ? (
            <ProviderEditor
              provider={selectedProvider}
              models={providerModels}
              activeId={activeId}
              selectedModelId={selectedModelId}
              testing={testingId === selectedProvider.id}
              testResult={testResults[selectedProvider.id]}
              listLoading={Boolean(modelListLoading[selectedProvider.id])}
              onSelectModel={setSelectedModelId}
              onSetActive={(id) => { setActiveId(id); setSelectedModelId(id); }}
              onUpdateProvider={(updates) => updateProvider(selectedProvider.id, updates)}
              onAddModel={() => addModel(selectedProvider.id)}
              onRemoveModel={removeModel}
              onUpdateModel={updateModel}
              onRemoveProvider={() => {
                removeProvider(selectedProvider.id);
                setSelectedProviderId(null);
              }}
              onTest={() => void testProvider(selectedProvider)}
              onFetchList={() => void fetchModelList(selectedProvider)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t('models.emptyAll', '还没有供应商，先添加一个')}
            </div>
          )}
          <button
            onClick={() => { addProvider(); }}
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
