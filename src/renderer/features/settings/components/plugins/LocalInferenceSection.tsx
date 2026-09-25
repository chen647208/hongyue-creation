/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { LocalProbeResult, LocalRuntimeConfig, LocalRuntimeStatus } from '@shared/types';
import React, { useEffect, useState } from 'react';

import { useTranslation } from '@/i18n';
import {
  decideInferenceTarget,
  getLocalInferenceConfig,
  getLocalRuntimeStatus,
  probeLocalInference,
  resetLocalInferenceProbeCache,
  setLocalInferenceConfig,
  startLocalRuntime,
  stopLocalRuntime,
} from '@/shared/services/localInferenceService';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Spinner } from '@/shared/ui/Spinner';
import { Switch } from '@/shared/ui/Switch';

/** 本地推理接入：启用 + 端点 + 模型探测；关闭或不可达即回落远程网关。 */
const LocalInferenceSection: React.FC = () => {
  const { t } = useTranslation(['settings']);
  const [config, setConfig] = useState<LocalRuntimeConfig>({ enabled: false, endpoint: '' });
  const [status, setStatus] = useState<LocalRuntimeStatus>({ running: false });
  const [probe, setProbe] = useState<LocalProbeResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setConfig(await getLocalInferenceConfig());
      setStatus(await getLocalRuntimeStatus());
    })();
  }, []);

  const persist = async (next: LocalRuntimeConfig): Promise<void> => {
    setConfig(next);
    // 配置变化即失效探测缓存，生成路径的下一次路由按新配置判定
    resetLocalInferenceProbeCache();
    await setLocalInferenceConfig(next);
  };

  const runProbe = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await probeLocalInference();
      setProbe(result);
      resetLocalInferenceProbeCache();
      setStatus(await getLocalRuntimeStatus());
    } finally {
      setBusy(false);
    }
  };

  const target = decideInferenceTarget(config, probe?.reachable === true);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t('plugins.local.title')}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('plugins.local.enabled')}</span>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => void persist({ ...config, enabled: checked })}
            aria-label={t('plugins.local.enabled')}
          />
        </div>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{t('plugins.local.hint')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={config.endpoint}
          onChange={(event) => void persist({ ...config, endpoint: event.target.value })}
          placeholder="http://127.0.0.1:11434"
          className="h-8 flex-1 font-mono text-xs"
          aria-label={t('plugins.local.endpoint')}
        />
        <Button size="sm" variant="outline" onClick={() => void runProbe()} disabled={busy || !config.enabled}>
          {busy ? <Spinner className="size-3.5" /> : t('plugins.local.probe')}
        </Button>
        {status.running ? (
          <Button size="sm" variant="outline" onClick={() => void stopLocalRuntime().then(() => setStatus({ running: false }))}>
            {t('plugins.local.stop')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void startLocalRuntime().then(setStatus)} disabled={!config.enabled}>
            {t('plugins.local.start')}
          </Button>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          value={config.command ?? ''}
          onChange={(event) => void persist({ ...config, command: event.target.value.trim() || undefined })}
          placeholder={t('plugins.local.commandPlaceholder')}
          className="h-8 flex-1 font-mono text-xs"
          aria-label={t('plugins.local.command')}
        />
        <Input
          value={(config.args ?? []).join(' ')}
          onChange={(event) =>
            void persist({
              ...config,
              args: event.target.value.trim() ? event.target.value.trim().split(/\s+/) : undefined,
            })
          }
          placeholder={t('plugins.local.argsPlaceholder')}
          className="h-8 flex-1 font-mono text-xs"
          aria-label={t('plugins.local.args')}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('plugins.local.commandHint')}</p>
      {probe && (
        <p className="mt-2 text-xs text-muted-foreground">
          {probe.reachable
            ? t('plugins.local.reachable', { count: probe.models.length, endpoint: probe.endpoint })
            : t('plugins.local.unreachable', { error: probe.error ?? '' })}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {target.kind === 'local' ? t('plugins.local.routeLocal') : t('plugins.local.routeRemote', { reason: target.reason })}
      </p>
      {probe?.reachable && probe.models.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {probe.models.slice(0, 30).map((model) => (
            <button
              key={model.id}
              type="button"
              aria-pressed={config.model === model.id}
              onClick={() => void persist({ ...config, model: model.id })}
              className={`rounded-full border px-2 py-0.5 text-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
                config.model === model.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted'
              }`}
            >
              {model.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocalInferenceSection;
