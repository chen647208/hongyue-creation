/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 同步对话框：导出/导入同步包 + 传输上传/下载 + 冲突副本报告。 */
import { ArrowLeftRight } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { dialogService } from '@/shared/services/dialogService';
import { downloadSyncBundle, exportSyncBundle, importSyncBundle, type SyncApplyReport,syncObjectKey, uploadSyncBundle } from '@/shared/services/syncService';
import { loadSyncTransportConfig } from '@/shared/services/syncTransportService';
import { Button } from '@/shared/ui/Button';
import { ModalShell } from '@/shared/ui/ModalShell';
import { Spinner } from '@/shared/ui/Spinner';

import type { Project, SyncTransportConfig } from '../../../shared/types';

function transportReady(config: SyncTransportConfig | null): boolean {
  if (!config) return false;
  if (config.kind === 'local') return !!config.directory.trim();
  if (config.kind === 'webdav') return !!config.baseUrl.trim() && (config.authType === 'none' || !!config.credentialRef);
  return !!config.endpoint.trim() && !!config.bucket.trim() && !!config.accessKeyId.trim() && !!config.secretRef;
}

export const SyncDialog: React.FC<{ project: Project | null }> = ({ project }) => {
  const { t } = useTranslation('app');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<SyncApplyReport | null>(null);
  const [transportConfig, setTransportConfig] = useState<SyncTransportConfig | null>(() => loadSyncTransportConfig());

  const ready = transportReady(transportConfig);

  const showError = (title: string, err: unknown): void => {
    dialogService.alert({ title, message: err instanceof Error ? err.message : String(err) });
  };

  const handleExport = async (): Promise<void> => {
    if (!project) return;
    setBusy(true);
    try {
      const result = await exportSyncBundle(project.id, project.title);
      dialogService.alert({
        title: t('sync.exportDone'),
        message: t('sync.exportDoneMessage', { count: result.changeCount, path: result.path }),
      });
      setOpen(false);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('已取消'))) {
        showError(t('sync.exportFailed'), err);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await importSyncBundle();
      setReport(result);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('已取消'))) {
        showError(t('sync.importFailed'), err);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (): Promise<void> => {
    if (!project || !transportConfig) return;
    setBusy(true);
    try {
      const result = await uploadSyncBundle(project.id, transportConfig);
      dialogService.alert({
        title: t('sync.uploadDone'),
        message: t('sync.uploadDoneMessage', { count: result.changeCount, key: result.key }),
      });
      setOpen(false);
    } catch (err) {
      showError(t('sync.uploadFailed'), err);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (): Promise<void> => {
    if (!project || !transportConfig) return;
    setBusy(true);
    try {
      const result = await downloadSyncBundle(transportConfig, syncObjectKey(project.id));
      setReport(result);
    } catch (err) {
      showError(t('sync.downloadFailed'), err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          setReport(null);
          setTransportConfig(loadSyncTransportConfig());
          setOpen(true);
        }}
        disabled={!project}
        title={t('sync.title')}
      >
        <ArrowLeftRight className="size-4" />
      </Button>

      {open && project && (
        <ModalShell
          open
          onOpenChange={(v) => { if (!v && !busy) setOpen(v); }}
          title={t('sync.title')}
          description={t('sync.description')}
          footer={
            <>
              <Button variant="outline" onClick={handleImport} disabled={busy} aria-busy={busy}>
                {busy && <Spinner className="size-4" />}
                {t('sync.import')}
              </Button>
              <Button variant="outline" onClick={handleDownload} disabled={busy || !ready} aria-busy={busy}>
                {t('sync.download')}
              </Button>
              <Button variant="outline" onClick={handleExport} disabled={busy} aria-busy={busy}>
                {busy && <Spinner className="size-4" />}
                {t('sync.export')}
              </Button>
              <Button onClick={handleUpload} disabled={busy || !ready} aria-busy={busy}>
                {t('sync.upload')}
              </Button>
            </>
          }
        >
          {report ? (
            <div className="space-y-2 text-sm">
              <div>{t('sync.reportApplied', { count: report.applied })}</div>
              <div>{t('sync.reportSkipped', { count: report.skipped })}</div>
              <div>{t('sync.reportManual', { count: report.manual })}</div>
              {report.conflictCopies.length > 0 && (
                <div className="rounded-md border border-border p-2">
                  <div className="mb-1 font-medium">{t('sync.conflictCopies')}</div>
                  {report.conflictCopies.map((c) => (
                    <div key={c.id} className="text-muted-foreground">
                      {c.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{t('sync.hint', { book: project.title })}</p>
              {transportConfig && (
                <p>{ready ? t('sync.transportHint', { backend: transportConfig.kind }) : t('sync.transportMissing')}</p>
              )}
            </div>
          )}
        </ModalShell>
      )}
    </>
  );
};

export default SyncDialog;
