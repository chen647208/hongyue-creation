/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { PluginCatalogEntry } from '@core/plugin';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import type { PluginInstallResult } from '@shared/types';
import React, { useState } from 'react';

import { useTranslation } from '@/i18n';
import { localStore } from '@/shared/services/localStore';
import { installPluginFromDirectory, readAllowAnyPluginSource, readPluginCatalog } from '@/shared/services/pluginService';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { APP_VERSION } from '@/shared/version';

/** 安装/更新/卸载：目录索引安装 + 本地目录安装；校验签名与来源后落盘。 */
const InstallSection: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { t } = useTranslation(['settings']);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [entries, setEntries] = useState<Array<{ entry: PluginCatalogEntry; baseDir: string }>>([]);

  const allowedSources = (): string[] => {
    try {
      const raw = localStore.getItem(STORAGE_KEYS.allowedPluginSources);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
    } catch {
      return [];
    }
  };

  const describe = (result: PluginInstallResult): string =>
    result.ok
      ? t('plugins.install.done', { id: result.pluginId, version: result.version, action: result.action })
      : t('plugins.install.failed', { reason: result.reason ?? '' });

  const installDir = async (sourceDir: string, expectedDigest?: string): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await installPluginFromDirectory({
        sourceDir,
        hostVersion: APP_VERSION,
        allowedSources: allowedSources(),
        allowAnySource: readAllowAnyPluginSource(),
        expectedDigest,
      });
      setMessage(describe(result));
      if (result.ok) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const pickFolder = async (): Promise<void> => {
    const api = window.electronAPI;
    if (!api) {
      setMessage(t('plugins.install.unavailable'));
      return;
    }
    const picked = await api.openDirectoryDialog({ title: t('plugins.install.pickFolder'), properties: ['openDirectory'] });
    const dir = picked.filePaths[0];
    if (picked.canceled || !dir) return;
    await installDir(dir);
  };

  const pickCatalog = async (): Promise<void> => {
    const api = window.electronAPI;
    if (!api) {
      setMessage(t('plugins.install.unavailable'));
      return;
    }
    const picked = await api.openFileDialog({ title: t('plugins.install.pickCatalog'), properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return;
    try {
      const parsed = await readPluginCatalog(file);
      if (!parsed.ok) {
        setMessage(t('plugins.install.catalogInvalid'));
        return;
      }
      const baseDir = file.replace(/[\\/][^\\/]*$/, '');
      setEntries(parsed.catalog.entries.map((entry) => ({ entry, baseDir })));
      setMessage(null);
    } catch {
      setMessage(t('plugins.install.catalogInvalid'));
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 text-sm font-medium">{t('plugins.install.title')}</div>
      <p className="mb-2 text-xs text-muted-foreground">{t('plugins.install.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void pickFolder()} disabled={busy}>
          {t('plugins.install.fromFolder')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void pickCatalog()} disabled={busy}>
          {t('plugins.install.fromCatalog')}
        </Button>
        {busy && <Spinner className="size-4" />}
      </div>
      {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
      {entries.length > 0 && (
        <div className="mt-3 space-y-2">
          {entries.map(({ entry, baseDir }) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{entry.name} <span className="text-muted-foreground">{entry.version}</span></div>
                <div className="truncate font-mono text-2xs text-muted-foreground">{entry.id} · {entry.source}</div>
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void installDir(`${baseDir}/${entry.path}`.replace(/\/+/g, '/'), entry.digest)}
              >
                {t('plugins.install.action')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InstallSection;
