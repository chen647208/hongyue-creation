/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { AlertCircle, CheckCircle2, Clock, Eye, EyeOff, FlaskConical, List, PlusCircle, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import { dt, useTranslation } from '@/i18n';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { Spinner } from '@/shared/ui/Spinner';
import { Switch } from '@/shared/ui/Switch';
import { Textarea } from '@/shared/ui/Textarea';
import { cn } from '@/shared/utils/cn';

import type { ModelConfig, ProviderConfig, ResolvedModelConfig } from '../../../../shared/types';
import { findProviderPreset, modelProviders } from '../../../constants/modelProviders';
import { isProviderConfigured } from '../../../shared/utils/modelReadiness';
import { channelGroups, channelPatch, channelValueFor } from '../utils/channelPreset';
import { classifyProviderError, isErrorResult, maskApiKey } from '../utils/providerHealth';

const CHANNEL_GROUPS = channelGroups(modelProviders);
const fieldLabel = 'mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground';
const hintText = 'mt-1.5 text-xs text-muted-foreground';

interface ProviderEditorProps {
  provider: ProviderConfig;
  /** 该供应商下的模型（已完成运行时投影）。 */
  models: ResolvedModelConfig[];
  activeId: string | null;
  selectedModelId: string | null;
  testing: boolean;
  testResult: string | undefined;
  listLoading: boolean;
  onSelectModel: (id: string) => void;
  onSetActive: (id: string) => void;
  onUpdateProvider: (updates: Partial<ProviderConfig>) => void;
  onAddModel: () => void;
  onRemoveModel: (id: string) => void;
  onUpdateModel: (id: string, updates: Partial<ModelConfig>) => void;
  onRemoveProvider: () => void;
  onTest: () => void;
  onFetchList: () => void;
}

/**
 * 单个供应商编辑：凭证只填一次（渠道 → 地址 → Key），下面挂该供应商的模型列表。
 * 运行时的协议、地址与凭证由供应商投影到每个模型，落盘只有供应商一份。
 */
export const ProviderEditor: React.FC<ProviderEditorProps> = ({
  provider, models, activeId, selectedModelId, testing, testResult, listLoading,
  onSelectModel, onSetActive, onUpdateProvider, onAddModel, onRemoveModel, onUpdateModel,
  onRemoveProvider, onTest, onFetchList,
}) => {
  const { t, i18n } = useTranslation('settings');
  const [showKey, setShowKey] = useState(false);
  const preset = findProviderPreset(channelValueFor(provider));
  const isGateway = preset?.id === 'gateway-openai' || preset?.id === 'custom-openai';
  const errorDiag = isErrorResult(testResult) ? classifyProviderError(testResult ?? '') : null;
  const selectedModel = models.find((m) => m.id === selectedModelId) ?? models[0];
  const availableModels = provider.availableModels ?? [];
  const datalistId = `provider-models-${provider.id}`;

  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            className="min-w-0 flex-1 border-none bg-transparent p-0 font-serif text-lg font-medium text-foreground outline-none placeholder:text-muted-foreground/40 sm:max-w-72"
            value={provider.name}
            onChange={(e) => onUpdateProvider({ name: e.target.value })}
            placeholder={t('models.namePlaceholder')}
          />
          <span className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-2xs text-muted-foreground">
            {t('models.modelCount', '{{count}} 个模型', { count: models.length })}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onRemoveProvider} title={t('models.deleteTitle')}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className={fieldLabel} htmlFor={`provider-channel-${provider.id}`}>{t('models.channelLabel')}</label>
            <Select
              id={`provider-channel-${provider.id}`}
              value={channelValueFor(provider)}
              onChange={(e) => { const next = findProviderPreset(e.target.value); if (next) onUpdateProvider(channelPatch(next, provider)); }}
            >
              {CHANNEL_GROUPS.map((group) => (
                <optgroup key={group.id} label={t(group.labelKey)}>
                  {group.items.map((item) => (
                    <option key={item.id} value={item.id}>{dt(item.nameKey)}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <p className={hintText}>{preset ? dt(preset.descriptionKey) : ''}</p>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={fieldLabel}>{t('models.endpointLabel')}</label>
              {preset?.apiApplyUrl && (
                <a href={preset.apiApplyUrl} target="_blank" rel="noopener noreferrer" className="mb-1.5 text-xs text-primary hover:underline">
                  {t('models.getKey')}
                </a>
              )}
            </div>
            <Input
              className="font-mono"
              value={provider.endpoint || ''}
              onChange={(e) => onUpdateProvider({ endpoint: e.target.value })}
              placeholder={provider.provider === 'gemini' ? t('models.endpointPlaceholderGemini') : provider.provider === 'anthropic' ? t('models.endpointPlaceholderAnthropic') : 'https://api.example.com/v1'}
            />
            {isGateway && <p className={hintText}>{t('models.gatewayHint')}</p>}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className={fieldLabel}>{t('models.apiKeyLabel')}</label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={provider.apiKey || ''}
                onChange={(e) => onUpdateProvider({ apiKey: e.target.value })}
                placeholder="••••••••••••••••"
                className="pr-9 font-mono"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={showKey ? t('models.hideKey', '隐藏') : t('models.showKey', '显示')}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <p className={hintText}>
              {t('models.apiKeyHint')}
              {provider.apiKey ? ` · ${t('models.currentKeyMasked', '当前：{{mask}}', { mask: maskApiKey(provider.apiKey) })}` : ''}
            </p>
            <p className={hintText}>{t('models.apiKeySharedHint', '同一供应商下的所有模型共用这份 Key。')}</p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className={hintText}>{t('models.fetchListHint', '从服务商拉取可用模型，填入下方面的建议列表。')}</span>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onFetchList} disabled={listLoading || !isProviderConfigured(provider)}>
                {listLoading ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                {t('models.refreshList')}
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {listLoading && <div className="flex items-center gap-1 text-xs text-primary"><Spinner className="size-4" /><span>{t('models.fetchingList')}</span></div>}
              {provider.modelsFetchError && !listLoading && <div className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="size-4" /><span>{provider.modelsFetchError}</span></div>}
              {availableModels.length > 0 && !listLoading && (
                <div className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-4" /><span>{t('models.loadedCount', { count: availableModels.length })}</span></div>
              )}
              {provider.modelsLastFetched && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  {t('models.lastUpdated', { time: new Date(provider.modelsLastFetched).toLocaleTimeString(i18n.language) })}
                </span>
              )}
            </div>
            <datalist id={datalistId}>
              {availableModels.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">{t('models.modelsTitle', '模型')}</h3>
          <Button variant="secondary" size="sm" onClick={onAddModel}>
            <PlusCircle className="size-3.5" />
            {t('models.addModel', '添加模型')}
          </Button>
        </div>
        <div className="space-y-2">
          {models.map((model) => {
            const isActive = activeId === model.id;
            return (
              <div
                key={model.id}
                onClick={() => onSelectModel(model.id)}
                className={cn(
                  'grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors sm:grid-cols-[auto_1fr_1fr_auto]',
                  selectedModel?.id === model.id ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-accent/30',
                )}
              >
                <span
                  role="radio"
                  aria-checked={isActive}
                  aria-label={t('models.setActiveLabel')}
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onSetActive(model.id); }}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onSetActive(model.id); } }}
                  className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2', isActive ? 'border-primary' : 'border-input')}
                >
                  {isActive && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <Input
                  className="h-8 text-sm"
                  value={model.name}
                  onChange={(e) => onUpdateModel(model.id, { name: e.target.value })}
                  placeholder={t('models.namePlaceholder')}
                />
                <Input
                  className="col-span-2 h-8 font-mono text-xs sm:col-span-1"
                  list={datalistId}
                  value={model.modelName}
                  onChange={(e) => onUpdateModel(model.id, { modelName: e.target.value })}
                  placeholder={t('models.manualInputPlaceholder')}
                />
                <div className="flex items-center gap-1">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      aria-label={`${t('models.enableLabel', '启用')} ${model.name}`}
                      checked={model.isEnabled !== false}
                      onCheckedChange={(checked) => onUpdateModel(model.id, { isEnabled: checked })}
                    />
                    {t('models.enableLabel', '启用')}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title={t('models.deleteTitle')}
                    onClick={(e) => { e.stopPropagation(); onRemoveModel(model.id); }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          {models.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              {t('models.noModels', '还没有模型，先添加一个，填上模型名即可使用。')}
            </div>
          )}
        </div>
      </div>

      {selectedModel && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-5 flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">
              {t('models.advancedTitle')} · {selectedModel.name}
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('models.temperatureLabel')}</label>
                <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs tabular-nums text-foreground">
                  {selectedModel.temperature !== undefined ? selectedModel.temperature.toFixed(1) : '0.7'}
                </span>
              </div>
              <input type="range" min="0.0" max="2.0" step="0.1" className="w-full accent-primary" value={selectedModel.temperature ?? 0.7} onChange={(e) => onUpdateModel(selectedModel.id, { temperature: parseFloat(e.target.value) })} aria-label={t('models.temperatureLabel')} />
              <p className="text-xs text-muted-foreground">{t('models.temperatureHint')}</p>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={selectedModel.supportsVision !== false}
                  onChange={(e) => onUpdateModel(selectedModel.id, { supportsVision: e.target.checked })}
                  className="size-3.5"
                />
                {t('models.visionLabel')}
              </label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('models.maxTokensLabel')}</label>
                <span className="text-xs text-muted-foreground">{t('models.optional')}</span>
              </div>
              <Input type="number" min="1" max="8192" className="font-mono" value={selectedModel.maxTokens || ''} onChange={(e) => onUpdateModel(selectedModel.id, { maxTokens: e.target.value ? parseInt(e.target.value, 10) : undefined })} placeholder={t('models.maxTokensPlaceholder')} />
              <p className="text-xs text-muted-foreground">{t('models.maxTokensHint')}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('models.systemPromptLabel')}</label>
                <span className="text-xs text-muted-foreground">{t('models.optional')}</span>
              </div>
              <Textarea className="min-h-[96px] text-sm" value={selectedModel.systemPrompt || ''} onChange={(e) => onUpdateModel(selectedModel.id, { systemPrompt: e.target.value })} placeholder={t('models.systemPromptPlaceholder')} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('models.priceLabel')}</label>
                <span className="text-xs text-muted-foreground">{t('models.optional')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min="0" step="0.01" className="font-mono text-xs"
                  value={selectedModel.priceInPerM ?? ''}
                  onChange={(e) => onUpdateModel(selectedModel.id, { priceInPerM: e.target.value === '' ? undefined : Number(e.target.value) })}
                  placeholder={t('models.priceInPlaceholder')}
                />
                <Input
                  type="number" min="0" step="0.01" className="font-mono text-xs"
                  value={selectedModel.priceOutPerM ?? ''}
                  onChange={(e) => onUpdateModel(selectedModel.id, { priceOutPerM: e.target.value === '' ? undefined : Number(e.target.value) })}
                  placeholder={t('models.priceOutPlaceholder')}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('models.priceHint')}</p>
            </div>
          </div>
        </div>
      )}

      {testResult && (
        <Alert
          tone={isErrorResult(testResult) ? 'error' : 'success'}
          title={t('models.connectionLog')}
          className="mt-5 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-xs"
        >
          {testResult}
          {errorDiag && (
            <div className="mt-2 border-t border-destructive/20 pt-2 font-sans text-xs">
              {t(errorDiag.hintKey, '检查 Key / 额度 / 网络后重试，也可用聚合网关单 Key 切换模型验证。')}
            </div>
          )}
        </Alert>
      )}

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" size="sm" onClick={onFetchList} disabled={listLoading || !isProviderConfigured(provider)}>
          {listLoading ? <Spinner className="size-4" /> : <List className="size-4" />}
          {t('models.fetchList')}
        </Button>
        <Button variant="default" size="sm" onClick={onTest} disabled={testing || !selectedModel || !isProviderConfigured(provider)}>
          {testing ? <Spinner className="size-4" /> : <FlaskConical className="size-4" />}
          {testing ? t('models.testing') : t('models.testNow')}
        </Button>
      </div>
    </div>
  );
};

export default ProviderEditor;
