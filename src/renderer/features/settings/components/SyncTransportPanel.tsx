/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { SyncTransportConfig, SyncTransportObject } from '@shared/types';
import { Cloud } from 'lucide-react';
import React, { useState } from 'react';

import { useProjectStore } from '@/app/stores/projectStore';
import { useTranslation } from '@/i18n';
import { dialogService } from '@/shared/services/dialogService';
import { loadExitExportConfig, saveExitExportConfig } from '@/shared/services/syncExitService';
import { SYNC_OBJECT_PREFIX } from '@/shared/services/syncService';
import {
  listSyncObjects,
  loadSyncTransportConfig,
  removeSyncObject,
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
import { Switch } from '@/shared/ui/Switch';

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
  const [exitExportEnabled, setExitExportEnabled] = useState(() => loadExitExportConfig().enabled);
  const [exitExportBookIds, setExitExportBookIds] = useState<string[] | undefined>(() => loadExitExportConfig().bookIds);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteObjects, setRemoteObjects] = useState<SyncTransportObject[]>([]);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const projects = useProjectStore((s) => s.projects);
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

  const toggleExitExport = (enabled: boolean): void => {
    setExitExportEnabled(enabled);
    saveExitExportConfig({ enabled, bookIds: exitExportBookIds });
  };

  const allBooksSelected = exitExportBookIds === undefined;
  const isBookSelected = (id: string): boolean => allBooksSelected || (exitExportBookIds?.includes(id) ?? false);
  const applyBookSelection = (nextIds: string[]): void => {
    const value = nextIds.length === projects.length ? undefined : nextIds;
    setExitExportBookIds(value);
    saveExitExportConfig({ enabled: exitExportEnabled, bookIds: value });
  };
  const toggleBook = (id: string): void => {
    const current = new Set(allBooksSelected ? projects.map((p) => p.id) : exitExportBookIds);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    applyBookSelection(projects.map((p) => p.id).filter((pid) => current.has(pid)));
  };
  const toggleAllBooks = (): void => {
    applyBookSelection(allBooksSelected ? [] : projects.map((p) => p.id));
  };

  const refreshRemote = async (): Promise<void> => {
    setRemoteBusy(true);
    setRemoteError(null);
    try {
      const objects = await listSyncObjects(config, SYNC_OBJECT_PREFIX, { maxAttempts: 2, delayMs: 300 });
      setRemoteObjects([...objects].sort((a, b) => a.key.localeCompare(b.key)));
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : String(error));
    } finally {
      setRemoteBusy(false);
    }
  };

  const toggleRemote = (): void => {
    const next = !remoteOpen;
    setRemoteOpen(next);
    if (next) void refreshRemote();
  };

  const removeRemote = async (key: string): Promise<void> => {
    const confirmed = await dialogService.confirm({ message: t('syncTransfer.remoteRemoveConfirm', { key }), danger: true });
    if (!confirmed) return;
    setRemoteBusy(true);
    setRemoteError(null);
    try {
      await removeSyncObject(config, key, { maxAttempts: 2, delayMs: 300 });
      await refreshRemote();
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : String(error));
    } finally {
      setRemoteBusy(false);
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

        <div className="space-y-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" disabled={!desktop || remoteBusy} onClick={toggleRemote}>
            {remoteOpen ? t('syncTransfer.remoteHide') : t('syncTransfer.remoteShow')}
          </Button>
          {remoteOpen && (
            <div className="max-w-2xl space-y-2">
              {remoteBusy && <p className="text-xs text-muted-foreground">{t('syncTransfer.remoteLoading')}</p>}
              {remoteError && <p className="text-xs text-destructive">{t('syncTransfer.remoteFailed', { error: remoteError })}</p>}
              {!remoteBusy && !remoteError && remoteObjects.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('syncTransfer.remoteEmpty')}</p>
              )}
              {remoteObjects.length > 0 && (
                <ul className="space-y-1">
                  {remoteObjects.map((object) => (
                    <li key={object.key} className="flex items-center gap-2 rounded-md border border-border p-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-mono">{object.key}</span>
                      <span className="shrink-0 text-muted-foreground">{object.size}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 text-destructive"
                        disabled={remoteBusy}
                        onClick={() => void removeRemote(object.key)}
                      >
                        {t('syncTransfer.remoteRemove')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
          <span>
            <span className="block text-sm text-foreground">{t('syncTransfer.exitExportLabel')}</span>
            <span className="block text-xs text-muted-foreground">{t('syncTransfer.exitExportHint')}</span>
          </span>
          <Switch
            checked={exitExportEnabled}
            disabled={!desktop}
            onCheckedChange={toggleExitExport}
            aria-label={t('syncTransfer.exitExportLabel')}
          />
        </div>
        {exitExportEnabled && (
          <div className="space-y-1 border-t border-border pt-3">
            <span className="block text-xs text-muted-foreground">{t('syncTransfer.exitExportBooks')}</span>
            {projects.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('syncTransfer.exitExportNoBooks')}</p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" checked={allBooksSelected} onChange={toggleAllBooks} className="size-3.5 accent-primary" />
                  {t('syncTransfer.exitExportAllBooks')}
                </label>
                {projects.map((book) => (
                  <label key={book.id} className="flex cursor-pointer items-center gap-2 pl-5 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={isBookSelected(book.id)}
                      onChange={() => toggleBook(book.id)}
                      className="size-3.5 accent-primary"
                    />
                    <span className="truncate">{book.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {!desktop && <p className="text-xs text-muted-foreground">{t('syncTransfer.desktopOnly')}</p>}
      </CardContent>
    </Card>
  );
};

export default SyncTransportPanel;
