/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 朗读设置：引擎选择、音色、语速/音高与试听。配置即时写回 store，随设置弹窗保存落盘。 */
import { TTS_DEFAULT_ENDPOINTS, TTS_DEFAULT_MODELS, TTS_DEFAULT_VOICES, TTS_PITCH_RANGE, TTS_PROVIDERS, TTS_RATE_RANGE } from '@shared/constants/tts';
import type { TtsConfig } from '@shared/types';
import { Play, RefreshCw, Square, Volume2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { useTranslation } from '@/i18n';
import { isSpeechSynthesisSupported } from '@/shared/services/speechService';
import { listCloudVoices, listSystemVoices, startSpeech, stopSpeech } from '@/shared/services/ttsService';
import { Button } from '@/shared/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/Card';
import { Input } from '@/shared/ui/Input';
import { Label } from '@/shared/ui/Label';
import { Select } from '@/shared/ui/Select';
import { Switch } from '@/shared/ui/Switch';

interface TtsSettingsPanelProps {
  tts: TtsConfig;
  onTtsChange: (tts: TtsConfig) => void;
}

const fieldHint = 'mt-1.5 text-xs text-muted-foreground';

const TtsSettingsPanel: React.FC<TtsSettingsPanelProps> = ({ tts, onTtsChange }) => {
  const { t } = useTranslation('settings');
  const [voices, setVoices] = useState<string[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  const patch = (updates: Partial<TtsConfig>): void => onTtsChange({ ...tts, ...updates });

  const loadVoices = async (): Promise<void> => {
    setLoadingVoices(true);
    try {
      setVoices(tts.provider === 'system' ? (await listSystemVoices()).map((v) => v.name) : await listCloudVoices(tts));
    } finally {
      setLoadingVoices(false);
    }
  };

  useEffect(() => {
    setVoices([]);
    setProbeError(null);
    void loadVoices();
    // 系统语音包异步就绪：稍后再取一次，避免下拉框长期只有默认项
    const retry = window.setTimeout(() => { if (voices.length === 0) void loadVoices(); }, 1500);
    return () => window.clearTimeout(retry);
    // 引擎切换时重新取音色：不同引擎音色命名体系不同
  }, [tts.provider]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopSpeech(), []);

  const previewText = t('tts.sample');

  const handlePreview = (): void => {
    stopSpeech();
    setProbeError(null);
    if (tts.provider === 'system' && !loadingVoices && voices.length === 0) {
      setProbeError(t('tts.noVoices'));
      return;
    }
    const playback = startSpeech(previewText, tts, {
      onEnd: (error) => {
        setSpeaking(false);
        if (error) setProbeError(error);
      },
    });
    if (!playback) {
      setProbeError(t('tts.unsupported'));
      return;
    }
    setSpeaking(true);
  };

  const needsKey = tts.provider !== 'system';

  return (
    <div className="max-w-3xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="size-4 text-muted-foreground" />
            {t('tts.title')}
          </CardTitle>
          <CardDescription>{t('tts.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tts-provider">{t('tts.providerLabel')}</Label>
              <Select
                id="tts-provider"
                value={tts.provider}
                onChange={(e) => {
                  const provider = e.target.value as TtsConfig['provider'];
                  patch({
                    provider,
                    model: TTS_DEFAULT_MODELS[provider],
                    voice: TTS_DEFAULT_VOICES[provider],
                    endpoint: TTS_DEFAULT_ENDPOINTS[provider] || undefined,
                  });
                }}
              >
                {TTS_PROVIDERS.map((p) => (
                  <option key={p} value={p}>{t(`tts.provider.${p}`)}</option>
                ))}
              </Select>
              <p className={fieldHint}>{t(`tts.providerHint.${tts.provider}`)}</p>
              {tts.provider === 'system' && !isSpeechSynthesisSupported() && (
                <p className="text-xs text-destructive">{t('tts.unsupported')}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tts-voice">{t('tts.voiceLabel')}</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void loadVoices()} disabled={loadingVoices}>
                  <RefreshCw className={loadingVoices ? 'size-3.5 animate-spin' : 'size-3.5'} />
                  {t('tts.refreshVoices')}
                </Button>
              </div>
              {voices.length > 0 ? (
                <Select id="tts-voice" value={tts.voice ?? ''} onChange={(e) => patch({ voice: e.target.value })}>
                  {(tts.provider === 'elevenlabs' || !tts.voice) && <option value="">{t('tts.systemDefaultVoice')}</option>}
                  {voices.map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
              ) : (
                <Input
                  id="tts-voice"
                  value={tts.voice ?? ''}
                  onChange={(e) => patch({ voice: e.target.value })}
                  placeholder={t('tts.voicePlaceholder')}
                  className="font-mono text-xs"
                />
              )}
              <p className={fieldHint}>{t('tts.voiceHint')}</p>
            </div>
          </div>

          {needsKey && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="tts-endpoint">{t('tts.endpointLabel')}</Label>
                <Input
                  id="tts-endpoint"
                  className="font-mono text-xs"
                  value={tts.endpoint ?? ''}
                  onChange={(e) => patch({ endpoint: e.target.value })}
                  placeholder={TTS_DEFAULT_ENDPOINTS[tts.provider]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tts-model">{t('tts.modelLabel')}</Label>
                <Input
                  id="tts-model"
                  className="font-mono text-xs"
                  value={tts.model ?? ''}
                  onChange={(e) => patch({ model: e.target.value })}
                  placeholder={TTS_DEFAULT_MODELS[tts.provider]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tts-apikey">{tts.provider === 'azure' ? t('tts.regionLabel') : t('tts.apiKeyLabel')}</Label>
                {tts.provider === 'azure' ? (
                  <Input
                    id="tts-apikey"
                    className="font-mono text-xs"
                    value={tts.region ?? ''}
                    onChange={(e) => patch({ region: e.target.value })}
                    placeholder="eastasia"
                  />
                ) : (
                  <Input
                    id="tts-apikey"
                    type="password"
                    className="font-mono text-xs"
                    value={tts.apiKey ?? ''}
                    onChange={(e) => patch({ apiKey: e.target.value })}
                    placeholder="••••••••••••••••"
                  />
                )}
              </div>
            </div>
          )}

          {tts.provider === 'azure' && (
            <div className="space-y-2">
              <Label htmlFor="tts-azure-key">{t('tts.apiKeyLabel')}</Label>
              <Input
                id="tts-azure-key"
                type="password"
                className="font-mono text-xs"
                value={tts.apiKey ?? ''}
                onChange={(e) => patch({ apiKey: e.target.value })}
                placeholder="••••••••••••••••"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tts-rate">{t('tts.rateLabel', { value: tts.rate.toFixed(2) })}</Label>
              <input
                id="tts-rate"
                type="range"
                min={TTS_RATE_RANGE.min}
                max={TTS_RATE_RANGE.max}
                step={TTS_RATE_RANGE.step}
                value={tts.rate}
                onChange={(e) => patch({ rate: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tts-pitch">{t('tts.pitchLabel', { value: tts.pitch.toFixed(2) })}</Label>
              <input
                id="tts-pitch"
                type="range"
                min={TTS_PITCH_RANGE.min}
                max={TTS_PITCH_RANGE.max}
                step={TTS_PITCH_RANGE.step}
                value={tts.pitch}
                onChange={(e) => patch({ pitch: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="tts-autospeak">{t('tts.autoSpeakLabel')}</Label>
              <p className={fieldHint}>{t('tts.autoSpeakHint')}</p>
            </div>
            <Switch
              id="tts-autospeak"
              checked={tts.autoSpeak}
              onCheckedChange={(checked) => patch({ autoSpeak: checked })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {speaking ? (
              <Button variant="outline" onClick={() => { stopSpeech(); setSpeaking(false); }}>
                <Square className="size-4" />
                {t('tts.stop')}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void handlePreview()}>
                <Play className="size-4" />
                {t('tts.preview')}
              </Button>
            )}
            <p className={fieldHint}>{t('tts.previewHint')}</p>
          </div>
          {probeError && <p className="text-xs text-destructive">{probeError}</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default TtsSettingsPanel;
