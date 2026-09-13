/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { AlertTriangle, Clock, Database, FileText, FolderOpen, History, Info, Save, Settings, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { checkImportVersion,normalizeImportedState } from '@/app/initialState';
import { composeAppState, seedPersistBaseline } from '@/app/stores/persistenceBridge';
import { hydrateStoresFromState } from '@/app/useAppBootstrap';
import { useTranslation } from '@/i18n';
import { autoBackupService } from '@/shared/services/autoBackupService';
import { dialogService } from '@/shared/services/dialogService';
import { repository } from '@/shared/services/repository';
import { Button } from '@/shared/ui/Button';
/** 存储设置区块的小标题 */
import { FieldLabel } from '@/shared/ui/FieldLabel';
import { Input } from '@/shared/ui/Input';
import { Switch } from '@/shared/ui/Switch';
import { formatDate, formatDateTime } from '@/shared/utils/format';
import { logger } from '@/shared/utils/logger';

import type { AppState } from '../../../../shared/types';
import type { StorageSettingsPanelProps } from '../types';
import { BackupRestoreDialog } from './BackupRestoreDialog';
import MirrorPanel from './MirrorPanel';
import OperationLogPanel from './OperationLogPanel';

/** 状态徽章 */
const StatusBadge: React.FC<{ tone: 'primary' | 'success' | 'muted'; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className={
      tone === 'primary'
        ? 'rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary'
        : tone === 'success'
          ? 'rounded border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success'
          : 'rounded border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground'
    }
  >
    {children}
  </span>
);

const StorageSettingsPanel: React.FC<StorageSettingsPanelProps> = ({
  storageConfig,
  setStorageConfig,
  onClearData,
}) => {
  const { t, i18n } = useTranslation('settings');
  const [backups, setBackups] = useState<Array<{ fileName: string; filePath: string; size: number; timestamp: number }>>([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [encryption, setEncryption] = useState<{ enabled: boolean; available: boolean; weakBackend: boolean; backend: string } | null>(null);
  const [encryptionBusy, setEncryptionBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<{ fileName: string; snapshot: AppState } | null>(null);
  const [dbBackups, setDbBackups] = useState<Array<{ name: string; bytes: number; mtime: number }>>([]);

  const reloadDbBackups = useCallback(() => {
    const api = window.electronAPI?.db;
    if (!api?.hotBackupList) return;
    void api.hotBackupList().then(setDbBackups).catch(() => setDbBackups([]));
  }, []);
  useEffect(() => {
    reloadDbBackups();
  }, [reloadDbBackups]);

  const handleVerifyDbBackup = async (fileName: string): Promise<void> => {
    const api = window.electronAPI?.db;
    if (!api?.hotBackupVerify) return;
    const result = await api.hotBackupVerify(fileName);
    dialogService.alert(result.ok ? t('storage.dbBackupVerifyOk') : t('storage.dbBackupVerifyFail', { detail: result.result ?? result.error ?? '' }));
  };

  const handleRestoreDbBackup = async (fileName: string): Promise<void> => {
    const api = window.electronAPI?.db;
    if (!api?.hotBackupRestore) return;
    if (!(await dialogService.confirm({ message: t('storage.dbBackupRestoreConfirm', { name: fileName }), danger: true }))) return;
    const result = await api.hotBackupRestore(fileName);
    dialogService.alert(result.ok ? t('storage.dbBackupRestoreDone') : t('storage.dbBackupRestoreFail', { detail: result.error ?? '' }));
  };

  const reloadBackups = useCallback(() => {
    void autoBackupService.getBackupHistory(storageConfig).then(setBackups).catch(() => setBackups([]));
  }, [storageConfig]);
  useEffect(() => {
    reloadBackups();
  }, [reloadBackups]);

  const handleManualBackup = async (): Promise<void> => {
    setBackupBusy(true);
    try {
      const ok = await autoBackupService.performBackup(storageConfig, () => composeAppState());
      dialogService.alert(t(ok ? 'storage.backupDone' : 'storage.backupFailed'));
      reloadBackups();
    } catch (error) {
      logger.error('手动备份失败:', error);
      dialogService.alert(t('storage.backupFailed'));
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = async (filePath: string, fileName: string): Promise<void> => {
    const snapshot = await autoBackupService.readBackup(filePath);
    if (!snapshot) {
      dialogService.alert(t('storage.restoreFailed'));
      return;
    }
    if (checkImportVersion(snapshot) === 'too-new') {
      dialogService.alert(t('storage.restoreTooNew'));
      return;
    }
    setRestoreTarget({ fileName, snapshot });
  };

  /** 按所选条目恢复：选中的快照书覆盖/插入当前状态，未选中的忽略；恢复前先快照当前库。 */
  const handleRestoreSelected = async (ids: string[]): Promise<void> => {
    const target = restoreTarget;
    if (!target) return;
    // 恢复前对当前库做一次热备份，避免"恢复错了"无法回退
    await repository.hotBackup?.().catch((error) => logger.warn('恢复前快照失败:', error));
    const byId = new Map(target.snapshot.projects.map((p) => [p.id, p]));
    const selected = new Set(ids);
    const current = composeAppState();
    const currentIds = new Set(current.projects.map((p) => p.id));
    const merged = current.projects.map((p) => (selected.has(p.id) ? (byId.get(p.id) ?? p) : p));
    for (const id of ids) {
      const book = byId.get(id);
      if (book && !currentIds.has(id)) merged.push(book);
    }
    const next = { ...current, projects: merged, activeProjectId: current.activeProjectId ?? merged[0]?.id ?? null };
    hydrateStoresFromState(normalizeImportedState(next));
    // 全量落盘：恢复后的状态可能远超差分增量，必须整库写入，否则磁盘仍是恢复前数据
    await repository.saveAll(composeAppState());
    seedPersistBaseline(composeAppState());
    setRestoreTarget(null);
    dialogService.alert(t('storage.restoreDone'));
  };

  const reloadEncryption = useCallback(() => {
    void repository.encryptionStatus?.().then(setEncryption).catch(() => setEncryption(null));
  }, []);
  useEffect(() => {
    reloadEncryption();
  }, [reloadEncryption]);

  const handleEnableEncryption = async (): Promise<void> => {
    const confirmed = await dialogService.confirm({ message: t('storage.enableEncryptionConfirm'), danger: true });
    if (!confirmed) return;
    setEncryptionBusy(true);
    try {
      const r = await repository.enableEncryption?.();
      if (r?.ok && r.recoveryCode) {
        await navigator.clipboard.writeText(r.recoveryCode).catch(() => {});
        dialogService.alert(`${t('storage.recoveryTitle')}\n\n${r.recoveryCode}\n\n${t('storage.recoveryHint')}`);
      } else {
        dialogService.alert(t('storage.encryptionFailed', { error: r?.error ?? '' }));
      }
      reloadEncryption();
    } finally {
      setEncryptionBusy(false);
    }
  };

  const handleDisableEncryption = async (): Promise<void> => {
    const confirmed = await dialogService.confirm({ message: t('storage.disableEncryptionConfirm'), danger: true });
    if (!confirmed) return;
    setEncryptionBusy(true);
    try {
      const r = await repository.disableEncryption?.();
      dialogService.alert(r?.ok ? t('storage.encryptionDisabledDone') : t('storage.encryptionFailed', { error: r?.error ?? '' }));
      if (r?.ok) reloadEncryption();
    } finally {
      setEncryptionBusy(false);
    }
  };

  const handleExportRecovery = async (): Promise<void> => {
    const r = await repository.exportRecoveryKey?.();
    if (r?.ok && r.code) {
      await navigator.clipboard.writeText(r.code).catch(() => {});
      dialogService.alert(`${t('storage.recoveryTitle')}\n\n${r.code}\n\n${t('storage.recoveryHint')}`);
    } else {
      dialogService.alert(t('storage.encryptionFailed', { error: r?.error ?? '' }));
    }
  };

  const handleApplyRecovery = async (): Promise<void> => {
    const code = await dialogService.prompt(t('storage.recoveryApplyPrompt'));
    if (!code) return;
    setEncryptionBusy(true);
    try {
      const r = await repository.applyRecoveryKey?.(code.trim());
      dialogService.alert(r?.ok ? t('storage.recoveryApplied') : t('storage.recoveryApplyFailed', { error: r?.error ?? '' }));
      if (r?.ok) reloadEncryption();
    } finally {
      setEncryptionBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Database className="size-6" />
        </div>
        <div>
          <h3 className="font-serif text-xl font-medium text-foreground">{t('storage.title')}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('storage.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 当前存储信息 */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
            <Info className="size-4 text-muted-foreground" />
            {t('storage.currentStatus')}
          </h4>

          <div className="space-y-4">
            <div>
              <FieldLabel>{t('storage.pathLabel')}</FieldLabel>
              <div className="truncate rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
                {storageConfig.dataPath || t('storage.defaultPath')}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const api = window.electronAPI;
                    if (!api) {
                      dialogService.alert(t('storage.electronUnavailable'));
                      return;
                    }
                    void api.getAppDataPath()
                      .then((dir) => api.openPath(storageConfig.dataPath || dir))
                      .catch(() => dialogService.alert(t('storage.openPathFailed')));
                  }}
                >
                  <FolderOpen className="size-3.5" /> {t('storage.openDataDir')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const api = window.electronAPI;
                    if (!api) {
                      dialogService.alert(t('storage.electronUnavailable'));
                      return;
                    }
                    void api.getAppDataPath()
                      .then((dir) => api.openPath(`${dir}/logs`))
                      .catch(() => dialogService.alert(t('storage.openPathFailed')));
                  }}
                >
                  <FileText className="size-3.5" /> {t('storage.openLogDir')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const api = window.electronAPI;
                    if (!api) {
                      dialogService.alert(t('storage.electronUnavailable'));
                      return;
                    }
                    void api.exportDiagnostics()
                      .then((r) => {
                        if (!r.canceled) dialogService.alert(t('storage.diagnosticsDone', { path: r.path ?? '' }));
                      })
                      .catch(() => dialogService.alert(t('storage.diagnosticsFailed')));
                  }}
                >
                  <FileText className="size-3.5" /> {t('storage.exportDiagnostics')}
                </Button>
                {repository.capabilities?.integrity !== false && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void repository.fullIntegrityCheck?.().then((r) => {
                      if (!r) { dialogService.alert(t('storage.integrityUnsupported')); return; }
                      dialogService.alert(r.ok ? t('storage.integrityOk') : t('storage.integrityFailed', { result: r.result }));
                    }).catch(() => dialogService.alert(t('storage.integrityFailed', { result: '' })));
                  }}
                >
                  <ShieldCheck className="size-3.5" /> {t('storage.integrityCheck')}
                </Button>
                )}
                {repository.capabilities?.hotBackup !== false && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void repository.runMaintenance?.()
                      .then(() => dialogService.alert(t('storage.maintenanceDone')))
                      .catch(() => dialogService.alert(t('storage.maintenanceFailed')));
                  }}
                >
                  <Wrench className="size-3.5" /> {t('storage.maintenance')}
                </Button>
                )}
              </div>
            </div>

            {encryption && (
            <div>
              <FieldLabel>{t('storage.encryptionLabel')}</FieldLabel>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge tone={encryption?.enabled ? 'success' : 'muted'}>
                  {encryption?.enabled ? t('storage.encryptionEnabled') : t('storage.encryptionDisabled')}
                </StatusBadge>
                {encryption && !encryption.enabled && encryption.available && (
                  <Button variant="outline" size="sm" disabled={encryptionBusy} onClick={() => void handleEnableEncryption()}>
                    <ShieldCheck className="size-3.5" /> {t('storage.enableEncryption')}
                  </Button>
                )}
                {encryption?.enabled && (
                  <Button variant="outline" size="sm" disabled={encryptionBusy} onClick={() => void handleExportRecovery()}>
                    <ShieldCheck className="size-3.5" /> {t('storage.exportRecoveryKey')}
                  </Button>
                )}
                {encryption?.enabled && (
                  <Button variant="outline" size="sm" disabled={encryptionBusy} onClick={() => void handleDisableEncryption()}>
                    <Trash2 className="size-3.5" /> {t('storage.disableEncryption')}
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled={encryptionBusy} onClick={() => void handleApplyRecovery()}>
                  <ShieldCheck className="size-3.5" /> {t('storage.applyRecoveryKey')}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t('storage.encryptionHint')}</p>
              {encryption && !encryption.available && (
                <p className="mt-2 text-xs text-warning">{t('storage.encryptionUnavailable')}</p>
              )}
              {encryption?.enabled && encryption.weakBackend && (
                <p className="mt-2 text-xs text-warning">{t('storage.encryptionWeakBackend')}</p>
              )}
            </div>
            )}

            <div>
              <FieldLabel>{t('storage.modeLabel')}</FieldLabel>
              <div className="flex items-center gap-2">
                <StatusBadge tone={storageConfig.useCustomPath ? 'primary' : 'muted'}>
                  {storageConfig.useCustomPath ? t('storage.customPathTag') : t('storage.defaultPathTag')}
                </StatusBadge>
                {storageConfig.lastMigration && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3.5" />
                    {t('storage.lastMigration', { date: formatDate(storageConfig.lastMigration, i18n.language) })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <FieldLabel>{t('storage.dataFileLabel')}</FieldLabel>
              <div className="font-mono text-xs text-foreground">novalist-data.json</div>
            </div>

            {/* 自动备份状态 */}
            <div>
              <FieldLabel>{t('storage.autoBackupStatus')}</FieldLabel>
              <div className="flex items-center gap-2">
                <StatusBadge tone={storageConfig.autoBackupEnabled ? 'success' : 'muted'}>
                  {storageConfig.autoBackupEnabled ? t('storage.enabled') : t('storage.disabled')}
                </StatusBadge>
                {storageConfig.lastAutoBackup && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <History className="size-3.5" />
                    {t('storage.lastBackup', { time: new Date(storageConfig.lastAutoBackup).toLocaleTimeString(i18n.language) })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 存储配置 */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
            <Settings className="size-4 text-muted-foreground" />
            {t('storage.configTitle')}
          </h4>

          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="mb-0.5 text-sm text-foreground">{t('storage.useCustomLabel')}</div>
                <p className="text-xs text-muted-foreground">{t('storage.useCustomHint')}</p>
                {typeof window !== 'undefined' && window.electronAPI?.db && (
                  <p className="mt-0.5 text-xs text-warning">{t('storage.customPathDbNote')}</p>
                )}
              </div>
              <Switch
                aria-label={t('storage.useCustomLabel')}
                checked={storageConfig.useCustomPath}
                disabled={typeof window !== 'undefined' && !!window.electronAPI?.db}
                onCheckedChange={(checked) => setStorageConfig({ ...storageConfig, useCustomPath: checked })}
              />
            </div>

            {storageConfig.useCustomPath && (
              <div>
                <FieldLabel>{t('storage.customPathLabel')}</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    className="flex-1 font-mono text-xs"
                    value={storageConfig.dataPath}
                    onChange={(e) => setStorageConfig({ ...storageConfig, dataPath: e.target.value })}
                    placeholder={t('storage.pathPlaceholder')}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      // 使用Electron API选择目录
                      if (window.electronAPI) {
                        try {
                          const result = await window.electronAPI.openDirectoryDialog({
                            title: t('storage.dialogTitle'),
                            defaultPath: storageConfig.dataPath || ''
                          });
                          if (!result.canceled && result.filePaths.length > 0) {
                            setStorageConfig({ ...storageConfig, dataPath: result.filePaths[0] ?? '' });
                          }
                        } catch (error) {
                          logger.error('选择目录失败:', error);
                        }
                      } else {
                        dialogService.alert(t('storage.electronUnavailable'));
                      }
                    }}
                  >
                    <FolderOpen className="size-3.5" />
                    {t('storage.selectDir')}
                  </Button>
                </div>
              </div>
            )}

            {/* 自动备份配置 */}
            <div className="space-y-5 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="mb-0.5 text-sm text-foreground">{t('storage.autoBackupLabel')}</div>
                  <p className="text-xs text-muted-foreground">{t('storage.autoBackupHint')}</p>
                </div>
                <Switch
                  aria-label={t('storage.autoBackupLabel')}
                  checked={storageConfig.autoBackupEnabled || false}
                  onCheckedChange={(checked) => setStorageConfig({
                    ...storageConfig,
                    autoBackupEnabled: checked,
                    autoBackupInterval: checked ? (storageConfig.autoBackupInterval || 10) : undefined,
                  })}
                />
              </div>

              {storageConfig.autoBackupEnabled && (
                <div className="space-y-4 border-l-2 border-primary/20 pl-4">
                  <div>
                    <FieldLabel>{t('storage.intervalLabel')}</FieldLabel>
                    <div className="flex gap-2">
                      {[5, 10, 30].map((interval) => (
                        <button
                          key={interval}
                          type="button"
                          onClick={() => setStorageConfig({ ...storageConfig, autoBackupInterval: interval })}
                          className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                            storageConfig.autoBackupInterval === interval
                              ? 'border-primary/40 bg-primary/5 text-primary'
                              : 'border-border text-muted-foreground hover:bg-accent/40'
                          }`}
                        >
                          {t('storage.intervalSeconds', { interval })}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{t('storage.intervalHint')}</p>
                  </div>

                  <div>
                    <FieldLabel>{t('storage.backupStateLabel')}</FieldLabel>
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={storageConfig.lastAutoBackup ? 'success' : 'muted'}>
                        {storageConfig.lastAutoBackup
                          ? t('storage.lastBackup', { time: new Date(storageConfig.lastAutoBackup).toLocaleTimeString(i18n.language) })
                          : t('storage.notBackedUp')
                        }
                      </StatusBadge>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleManualBackup()}
                        disabled={backupBusy}
                      >
                        <Save className="size-3.5" />
                        {t('storage.backupNow')}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <FieldLabel>{t('storage.policyLabel')}</FieldLabel>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t('storage.policyLine1')}<br />
                      {t('storage.policyLine2')}<br />
                      {t('storage.policyLine3')}<br />
                      {t('storage.policyLine4')}
                    </p>
                  </div>

                  <div>
                    <FieldLabel>{t('storage.historyTitle')}</FieldLabel>
                    {backups.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">{t('storage.historyEmpty')}</p>
                    ) : (
                      <div className="space-y-2">
                        {backups.map((b) => (
                          <div key={b.filePath} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate font-mono text-xs text-foreground">{b.fileName}</div>
                              <div className="text-2xs tabular-nums text-muted-foreground">
                                {formatDateTime(b.timestamp, i18n.language)} · {(b.size / 1024).toFixed(1)} KB
                              </div>
                            </div>
                            <Button size="sm" variant="outline" className="shrink-0" onClick={() => void handleRestoreBackup(b.filePath, b.fileName)}>
                              {t('storage.restore')}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <FieldLabel>{t('storage.dbBackupTitle')}</FieldLabel>
                    {dbBackups.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">{t('storage.dbBackupEmpty')}</p>
                    ) : (
                      <div className="space-y-2">
                        {dbBackups.map((b) => (
                          <div key={b.name} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate font-mono text-xs text-foreground">{b.name}</div>
                              <div className="text-2xs tabular-nums text-muted-foreground">
                                {formatDateTime(b.mtime, i18n.language)} · {(b.bytes / 1024).toFixed(1)} KB
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <Button size="sm" variant="outline" onClick={() => void handleVerifyDbBackup(b.name)}>{t('storage.dbBackupVerify')}</Button>
                              <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => void handleRestoreDbBackup(b.name)}>{t('storage.dbBackupRestore')}</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 数据操作 */}
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-5">
        <h4 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
          <AlertTriangle className="size-4 text-destructive" />
          {t('storage.dangerTitle')}
        </h4>


          <div>
            <FieldLabel>{t('storage.clearLabel')}</FieldLabel>
            <p className="mb-2 text-xs text-muted-foreground">{t('storage.clearHint')}</p>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={async () => {
                if (await dialogService.confirm({ message: t('storage.clearConfirm'), danger: true })) {
                  onClearData();
                }
              }}
            >
              <Trash2 className="size-3.5" />
              {t('storage.clearLabel')}
            </Button>
          </div>
      </div>

      <OperationLogPanel />

      <MirrorPanel />

      <BackupRestoreDialog
        open={restoreTarget !== null}
        snapshot={restoreTarget?.snapshot ?? null}
        fileName={restoreTarget?.fileName ?? ''}
        onClose={() => setRestoreTarget(null)}
        onConfirm={(ids) => void handleRestoreSelected(ids)}
      />
    </div>
  );
};

export default StorageSettingsPanel;
