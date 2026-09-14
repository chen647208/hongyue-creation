/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { AlertCircle, CheckCircle2, Clock, Eye, EyeOff, FlaskConical, List, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import { dt,useTranslation } from '@/i18n';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { Spinner } from '@/shared/ui/Spinner';
import { Textarea } from '@/shared/ui/Textarea';
import { cn } from '@/shared/utils/cn';

import type { ModelConfig } from '../../../../shared/types';
import { findProviderPreset,modelProviders } from '../../../constants/modelProviders';
import { isModelConfigured } from '../../../shared/utils/modelReadiness';
import { channelGroups,channelPatch, channelValueFor } from '../utils/channelPreset';
import { classifyProviderError, isErrorResult, isProviderEnabled, maskApiKey } from '../utils/providerHealth';

const CHANNEL_GROUPS = channelGroups(modelProviders);
const fieldLabel = 'mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground';
const hintText = 'mt-1.5 text-xs text-muted-foreground';

interface ProviderEditorProps {
  model: ModelConfig;
  active: boolean;
  testing: boolean;
  testResult: string | undefined;
  listLoading: boolean;
  onSetActive: () => void;
  onRemove: () => void;
  onUpdate: (updates: Partial<ModelConfig>) => void;
  onTest: () => void;
  onFetchList: () => void;
}

/**
 * 右侧单渠道编辑器：三步式（选渠道 → 填凭证 → 拉模型/测连通），高级参数折叠在下方。
 * 凭证 Key 默认掩码显示，错误结果走 classifyProviderError 给修复建议。
 */
export const ProviderEditor: React.FC<ProviderEditorProps> = ({
  model, active, testing, testResult, listLoading, onSetActive, onRemove, onUpdate, onTest, onFetchList,
}) => {
  const { t, i18n } = useTranslation('settings');
  const [showKey, setShowKey] = useState(false);
  const errorDiag = isErrorResult(testResult) ? classifyProviderError(testResult ?? '') : null;
  const preset = findProviderPreset(channelValueFor(model));
  const isGateway = preset?.id === 'gateway-openai' || preset?.id === 'custom-openai';

  return (
    <div className={cn('min-w-0 flex-1 rounded-lg border bg-card p-6', active ? 'border-primary/40' : 'border-border')}>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            role="radio"
            aria-checked={active}
            aria-label={t('models.setActiveLabel')}
            tabIndex={0}
            onClick={onSetActive}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onSetActive(); } }}
            className={cn('flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2', active ? 'border-primary' : 'border-input')}
          >
            {active && <span className="size-2 rounded-full bg-primary" />}
          </span>
          <input
            className="w-64 min-w-0 border-none bg-transparent p-0 font-serif text-lg font-medium text-foreground outline-none placeholder:text-muted-foreground/40"
            value={model.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={t('models.namePlaceholder')}
          />
          {active && (
            <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary">
              {t('models.activeBadge')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              className="size-3.5"
              checked={isProviderEnabled(model)}
              onChange={(e) => onUpdate({ isEnabled: e.target.checked })}
            />
            {t('models.enableLabel', '启用')}
          </label>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onRemove} title={t('models.deleteTitle')}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className={fieldLabel} htmlFor={`provider-channel-${model.id}`}>{t('models.channelLabel')}</label>
            <Select
              id={`provider-channel-${model.id}`}
              value={channelValueFor(model)}
              onChange={(e) => { const preset = findProviderPreset(e.target.value); if (preset) onUpdate(channelPatch(preset, model)); }}
            >
              {CHANNEL_GROUPS.map((group) => (
                <optgroup key={group.id} label={t(group.labelKey)}>
                  {group.items.map((preset) => (
                    <option key={preset.id} value={preset.id}>{dt(preset.nameKey)}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <p className={hintText}>{(() => { const p = findProviderPreset(channelValueFor(model)); return p ? dt(p.descriptionKey) : ''; })()}</p>
          </div>
          <div>
            <label className={fieldLabel} htmlFor={`provider-model-name-${model.id}`}>{t('models.modelNameLabel')}</label>
            <Select id={`provider-model-name-${model.id}`} value={model.modelName} onChange={(e) => onUpdate({ modelName: e.target.value })} disabled={listLoading} className="font-mono">
              <option value="">{t('models.selectModelPlaceholder')}</option>
              {model.availableModels && model.availableModels.length > 0 ? (
                model.availableModels.map((n) => <option key={n} value={n}>{n}</option>)
              ) : (
                <option value={model.modelName || ''}>{model.modelName || t('models.manualModelName')}</option>
              )}
            </Select>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {listLoading && <div className="flex items-center gap-1 text-xs text-primary"><Spinner className="size-4" /><span>{t('models.fetchingList')}</span></div>}
                {model.modelsFetchError && !listLoading && <div className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="size-4" /><span>{model.modelsFetchError}</span></div>}
                {model.availableModels && model.availableModels.length > 0 && !listLoading && (
                  <div className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-4" /><span>{t('models.loadedCount', { count: model.availableModels.length })}</span></div>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onFetchList} disabled={listLoading || !isModelConfigured(model)}>
                {listLoading ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                {t('models.refreshList')}
              </Button>
            </div>
            <div className="mt-2">
              <Input className="font-mono text-xs" value={model.modelName} onChange={(e) => onUpdate({ modelName: e.target.value })} placeholder={t('models.manualInputPlaceholder')} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('models.endpointLabel')}</label>
              {preset?.apiApplyUrl && (
                <a href={preset.apiApplyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                  {t('models.getKey')}
                </a>
              )}
            </div>
            <Input
              className="font-mono"
              value={model.endpoint || ''}
              onChange={(e) => onUpdate({ endpoint: e.target.value })}
              placeholder={model.provider === 'gemini' ? t('models.endpointPlaceholderGemini') : model.provider === 'anthropic' ? t('models.endpointPlaceholderAnthropic') : 'https://api.example.com/v1'}
            />
            {isGateway && <p className={hintText}>{t('models.gatewayHint')}</p>}
          </div>
          <div>
            <label className={fieldLabel}>{t('models.apiKeyLabel')}</label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={model.apiKey || ''}
                onChange={(e) => onUpdate({ apiKey: e.target.value })}
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
              {model.apiKey ? ` · ${t('models.currentKeyMasked', '当前：{{mask}}', { mask: maskApiKey(model.apiKey) })}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-5 flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">{t('models.advancedTitle')}</h3>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('models.temperatureLabel')}</label>
              <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs tabular-nums text-foreground">
                {model.temperature !== undefined ? model.temperature.toFixed(1) : '0.7'}
              </span>
            </div>
            <input type="range" min="0.0" max="2.0" step="0.1" className="w-full accent-primary" value={model.temperature ?? 0.7} onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })} aria-label={t('models.temperatureLabel')} />
            <p className="text-xs text-muted-foreground">{t('models.temperatureHint')}</p>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={model.supportsVision !== false}
                onChange={(e) => onUpdate({ supportsVision: e.target.checked })}
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
            <Input type="number" min="1" max="8192" className="font-mono" value={model.maxTokens || ''} onChange={(e) => onUpdate({ maxTokens: e.target.value ? parseInt(e.target.value, 10) : undefined })} placeholder={t('models.maxTokensPlaceholder')} />
            <p className="text-xs text-muted-foreground">{t('models.maxTokensHint')}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('models.systemPromptLabel')}</label>
              <span className="text-xs text-muted-foreground">{t('models.optional')}</span>
            </div>
            <Textarea className="min-h-[96px] text-sm" value={model.systemPrompt || ''} onChange={(e) => onUpdate({ systemPrompt: e.target.value })} placeholder={t('models.systemPromptPlaceholder')} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('models.priceLabel')}</label>
              <span className="text-xs text-muted-foreground">{t('models.optional')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number" min="0" step="0.01" className="font-mono text-xs"
                value={model.priceInPerM ?? ''}
                onChange={(e) => onUpdate({ priceInPerM: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder={t('models.priceInPlaceholder')}
              />
              <Input
                type="number" min="0" step="0.01" className="font-mono text-xs"
                value={model.priceOutPerM ?? ''}
                onChange={(e) => onUpdate({ priceOutPerM: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder={t('models.priceOutPlaceholder')}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('models.priceHint')}</p>
          </div>
        </div>
      </div>

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

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <div className="text-xs text-muted-foreground">
          {model.modelsLastFetched && (
            <div className="flex items-center gap-1">
              <Clock className="size-3.5" />
              <span>{t('models.lastUpdated', { time: new Date(model.modelsLastFetched).toLocaleTimeString(i18n.language) })}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onFetchList} disabled={listLoading || !isModelConfigured(model)}>
            {listLoading ? <Spinner className="size-4" /> : <List className="size-4" />}
            {t('models.fetchList')}
          </Button>
          <Button variant="default" size="sm" onClick={onTest} disabled={testing}>
            {testing ? <Spinner className="size-4" /> : <FlaskConical className="size-4" />}
            {testing ? t('models.testing') : t('models.testNow')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProviderEditor;
