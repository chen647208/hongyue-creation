/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { SyncTransportConfig } from '@shared/types';
import { Cloud } from 'lucide-react';
import React, { useState } from 'react';

import { useTranslation } from '@/i18n';
import {
  loadSyncTransportConfig,
  saveSyncTransportConfig,
  storeSyncTransportSecret,
  SYNC_SECRET_IDS,
  testSyncTransport,
} from '@/shared/services/syncTransportService';
import { Button } from '@/shared/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/Card';
import { Input } from '@/shared/ui/Input';
import { Label } from '@/shared/ui/Label';
import { Select } from '@/shared/ui/Select';

function defaultFor(kind: SyncTransportConfig['kind']): SyncTransportConfig {
  if (kind === 'webdav') {
    return { kind: 'webdav', baseUrl: '', remoteDir: '', authType: 'basic', username: '' };
  }
  if (kind === 's3') {
    return { kind: 's3', endpoint: '', region: 'us-east-1', bucket: '', prefix: '', accessKeyId: '', pathStyle: false };
  }
  return { kind: 'local', directory: '' };
}

/** 同步传输设置（docs/design/36）：配置后端并做连通测试；密钥存系统钥匙串。 */
const SyncTransportPanel: React.FC = () => {
  const { t } = useTranslation('settings');
  const [config, setConfig] = useState<SyncTransportConfig>(() => loadSyncTransportConfig());
  const [secretDraft, setSecretDraft] = useState('');
  const [secretState, setSecretState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [secretError, setSecretError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const desktop = typeof window !== 'undefined' && !!window.electronAPI;

  const commit = (next: SyncTransportConfig): void => {
    setConfig(next);
    saveSyncTransportConfig(next);
    setTestResult(null);
  };

  const patch = (partial: Record<string, unknown>): void => {
    commit({ ...config, ...partial } as SyncTransportConfig);
  };

  const handleKindChange = (kind: SyncTransportConfig['kind']): void => {
    setSecretState('idle');
    setSecretDraft('');
    commit(defaultFor(kind));
  };

  const pickDirectory = async (): Promise<void> => {
    const selected = await window.electronAPI?.openDirectoryDialog({ title: t('syncTransfer.pickDirectory') });
    const directory = selected?.filePaths[0];
    if (directory) patch({ directory });
  };

  const saveSecret = async (): Promise<void> => {
    const secretId = config.kind === 's3' ? SYNC_SECRET_IDS.s3 : SYNC_SECRET_IDS.webdav;
    setSecretState('saving');
    setSecretError(null);
    try {
      const ref = await storeSyncTransportSecret(secretId, secretDraft);
      if (config.kind === 's3') commit({ ...config, secretRef: ref });
      else if (config.kind === 'webdav') commit({ ...config, credentialRef: ref });
      setSecretDraft('');
      setSecretState('saved');
    } catch (error) {
      setSecretState('error');
      setSecretError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleTest = async (): Promise<void> => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testSyncTransport(config));
    } catch (error) {
      setTestResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  };

  const hasCredential = config.kind === 's3'
    ? !!config.secretRef
    : config.kind === 'webdav' && config.authType !== 'none' && !!config.credentialRef;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="size-4 text-muted-foreground" />
          {t('syncTransfer.title')}
        </CardTitle>
        <CardDescription>{t('syncTransfer.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-2">
          <Label htmlFor="sync-backend">{t('syncTransfer.backendLabel')}</Label>
          <Select
            id="sync-backend"
            value={config.kind}
            onChange={(e) => handleKindChange(e.target.value as SyncTransportConfig['kind'])}
          >
            <option value="local">{t('syncTransfer.backend.local')}</option>
            <option value="webdav">{t('syncTransfer.backend.webdav')}</option>
            <option value="s3">{t('syncTransfer.backend.s3')}</option>
          </Select>
        </div>

        {config.kind === 'local' && (
          <div className="max-w-xl space-y-2">
            <Label htmlFor="sync-directory">{t('syncTransfer.directory')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="sync-directory"
                value={config.directory}
                onChange={(e) => patch({ directory: e.target.value })}
                placeholder={t('syncTransfer.directoryPlaceholder')}
                className="font-mono"
              />
              <Button variant="outline" size="sm" disabled={!desktop} onClick={() => void pickDirectory()}>
                {t('syncTransfer.pickDirectory')}
              </Button>
            </div>
          </div>
        )}

        {config.kind === 'webdav' && (
          <div className="grid max-w-2xl gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sync-webdav-url">{t('syncTransfer.baseUrl')}</Label>
              <Input
                id="sync-webdav-url"
                value={config.baseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value })}
                placeholder="https://host/remote.php/dav/files/user"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-webdav-dir">{t('syncTransfer.remoteDir')}</Label>
              <Input
                id="sync-webdav-dir"
                value={config.remoteDir ?? ''}
                onChange={(e) => patch({ remoteDir: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-webdav-auth">{t('syncTransfer.authType')}</Label>
              <Select
                id="sync-webdav-auth"
                value={config.authType}
                onChange={(e) => patch({ authType: e.target.value })}
              >
                <option value="basic">{t('syncTransfer.authBasic')}</option>
                <option value="bearer">{t('syncTransfer.authBearer')}</option>
                <option value="none">{t('syncTransfer.authNone')}</option>
              </Select>
            </div>
            {config.authType === 'basic' && (
              <div className="space-y-2">
                <Label htmlFor="sync-webdav-user">{t('syncTransfer.username')}</Label>
                <Input
                  id="sync-webdav-user"
                  value={config.username ?? ''}
                  onChange={(e) => patch({ username: e.target.value })}
                />
              </div>
            )}
          </div>
        )}

        {config.kind === 's3' && (
          <div className="grid max-w-2xl gap-3 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sync-s3-endpoint">{t('syncTransfer.endpoint')}</Label>
              <Input
                id="sync-s3-endpoint"
                value={config.endpoint}
                onChange={(e) => patch({ endpoint: e.target.value })}
                placeholder="https://s3.us-east-1.amazonaws.com"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-s3-region">{t('syncTransfer.region')}</Label>
              <Input id="sync-s3-region" value={config.region} onChange={(e) => patch({ region: e.target.value })} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-s3-bucket">{t('syncTransfer.bucket')}</Label>
              <Input id="sync-s3-bucket" value={config.bucket} onChange={(e) => patch({ bucket: e.target.value })} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-s3-prefix">{t('syncTransfer.prefix')}</Label>
              <Input id="sync-s3-prefix" value={config.prefix ?? ''} onChange={(e) => patch({ prefix: e.target.value })} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-s3-key">{t('syncTransfer.accessKeyId')}</Label>
              <Input id="sync-s3-key" value={config.accessKeyId} onChange={(e) => patch({ accessKeyId: e.target.value })} className="font-mono" />
            </div>
            <label className="flex items-center gap-2 pt-1 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={config.pathStyle}
                onChange={(e) => patch({ pathStyle: e.target.checked })}
                className="size-4 accent-primary"
              />
              {t('syncTransfer.pathStyle')}
            </label>
          </div>
        )}

        {(config.kind === 's3' || (config.kind === 'webdav' && config.authType !== 'none')) && (
          <div className="max-w-xl space-y-2">
            <Label htmlFor="sync-secret">
              {config.kind === 's3' ? t('syncTransfer.secretLabel') : t('syncTransfer.credentialLabel')}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="sync-secret"
                type="password"
                value={secretDraft}
                onChange={(e) => setSecretDraft(e.target.value)}
                className="font-mono"
              />
              <Button variant="outline" size="sm" disabled={!desktop || !secretDraft || secretState === 'saving'} onClick={() => void saveSecret()}>
                {t('syncTransfer.saveCredential')}
              </Button>
            </div>
            {secretState === 'saved' && <p className="text-xs text-muted-foreground">{t('syncTransfer.credentialSaved')}</p>}
            {secretState === 'error' && secretError && (
              <p className="text-xs text-destructive">{t('syncTransfer.credentialFailed', { error: secretError })}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" disabled={!desktop || testing} onClick={() => void handleTest()}>
            {testing ? t('syncTransfer.testing') : t('syncTransfer.test')}
          </Button>
          {testResult && (
            <span className={testResult.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
              {testResult.ok ? t('syncTransfer.testOk') : t('syncTransfer.testFail', { error: testResult.message })}
            </span>
          )}
          {hasCredential && secretState !== 'saved' && (
            <span className="text-xs text-muted-foreground">{t('syncTransfer.credentialReady')}</span>
          )}
        </div>
        {!desktop && <p className="text-xs text-muted-foreground">{t('syncTransfer.desktopOnly')}</p>}
      </CardContent>
    </Card>
  );
};

export default SyncTransportPanel;
