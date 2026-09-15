/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 同步对话框：导出/导入同步包 + 传输上传/下载 + 冲突三选 + 自动恢复记录。
 * 冲突落地策略只影响"怎么落地"，冲突分类仍由 core/sync 的 mergeBundle 给出。
 */
import { ArrowLeftRight, History } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { dialogService } from '@/shared/services/dialogService';
import {
  appendSyncRecoveryRecord,
  clearPendingMerge,
  listPendingMerges,
  listSyncRecoveryRecords,
  type PendingMergeConflict,
  registerPendingMerge,
  type SyncRecoveryKind,
  type SyncRecoveryRecord,
} from '@/shared/services/syncRecoveryService';
import {
  applySyncPlan,
  exportSyncBundle,
  prepareBundlePlan,
  prepareDownloadBundle,
  prepareImportBundle,
  type SyncApplyReport,
  type SyncConflictPolicy,
  type SyncMergePlan,
  syncObjectKey,
  uploadSyncBundle,
} from '@/shared/services/syncService';
import { isTransportReady, loadSyncTransportConfig } from '@/shared/services/syncTransportService';
import { Button } from '@/shared/ui/Button';
import { ModalShell } from '@/shared/ui/ModalShell';
import { Spinner } from '@/shared/ui/Spinner';

import type { Project, SyncTransportConfig } from '../../../shared/types';

const POLICIES: SyncConflictPolicy[] = ['keep-copy', 'use-remote', 'defer'];

export const SyncDialog: React.FC<{ project: Project | null; triggerLabel?: string }> = ({ project, triggerLabel }) => {
  const { t } = useTranslation('app');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<SyncMergePlan | null>(null);
  const [mergeKind, setMergeKind] = useState<SyncRecoveryKind>('import');
  const [policy, setPolicy] = useState<SyncConflictPolicy>('keep-copy');
  const [report, setReport] = useState<SyncApplyReport | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [records, setRecords] = useState<SyncRecoveryRecord[]>(() => listSyncRecoveryRecords());
  const [pendingMerges, setPendingMerges] = useState<PendingMergeConflict[]>(() => listPendingMerges());
  const [transportConfig, setTransportConfig] = useState<SyncTransportConfig | null>(() => loadSyncTransportConfig());

  const ready = isTransportReady(transportConfig);

  const refreshRecords = useCallback((): void => {
    setRecords(listSyncRecoveryRecords());
    setPendingMerges(listPendingMerges());
  }, []);

  useEffect(() => {
    if (open) refreshRecords();
  }, [open, refreshRecords]);

  const showError = (title: string, err: unknown): void => {
    dialogService.alert({ title, message: err instanceof Error ? err.message : String(err) });
  };

  /** 记一条同步结果（合并成功/待处理/失败都留痕，供恢复记录查看）。 */
  const recordMerge = (kind: SyncRecoveryKind, bookId: string | undefined, result: SyncApplyReport): void => {
    appendSyncRecoveryRecord({
      kind,
      outcome: result.pendingConflicts > 0 ? 'pending' : 'ok',
      bookId,
      applied: result.applied,
      skipped: result.skipped,
      manual: result.manual,
      conflicts: result.pendingConflicts > 0 ? result.pendingConflicts : result.conflictCopies.length,
    });
    refreshRecords();
  };

  const recordFailure = (kind: SyncRecoveryKind, bookId: string | undefined, err: unknown): void => {
    appendSyncRecoveryRecord({
      kind,
      outcome: 'failed',
      bookId,
      message: err instanceof Error ? err.message : String(err),
    });
    refreshRecords();
  };

  const handleExport = async (): Promise<void> => {
    if (!project) return;
    setBusy(true);
    try {
      const result = await exportSyncBundle(project.id, project.title);
      appendSyncRecoveryRecord({ kind: 'export', outcome: 'ok', bookId: project.id, applied: result.changeCount });
      refreshRecords();
      dialogService.alert({
        title: t('sync.exportDone'),
        message: t('sync.exportDoneMessage', { count: result.changeCount, path: result.path }),
      });
      setOpen(false);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('已取消'))) {
        recordFailure('export', project.id, err);
        showError(t('sync.exportFailed'), err);
      }
    } finally {
      setBusy(false);
    }
  };

  /** 预合并完成后分流：无冲突直接落地；有冲突交给三选。 */
  const dispatchPlan = async (next: SyncMergePlan, kind: SyncRecoveryKind): Promise<void> => {
    if (next.conflicts.length === 0) {
      const result = await applySyncPlan(next, 'keep-copy');
      clearPendingMerge(next.bookId);
      refreshRecords();
      setReport(result);
      recordMerge(kind, next.bookId, result);
      return;
    }
    setMergeKind(kind);
    setPolicy('keep-copy');
    setPlan(next);
  };

  const handleImport = async (): Promise<void> => {
    setBusy(true);
    try {
      const next = await prepareImportBundle();
      if (!next) return;
      await dispatchPlan(next, 'import');
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('已取消'))) {
        recordFailure('import', project?.id, err);
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
      appendSyncRecoveryRecord({ kind: 'upload', outcome: 'ok', bookId: project.id, applied: result.changeCount });
      refreshRecords();
      dialogService.alert({
        title: t('sync.uploadDone'),
        message: t('sync.uploadDoneMessage', { count: result.changeCount, key: result.key }),
      });
      setOpen(false);
    } catch (err) {
      recordFailure('upload', project.id, err);
      showError(t('sync.uploadFailed'), err);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (): Promise<void> => {
    if (!project || !transportConfig) return;
    setBusy(true);
    try {
      const next = await prepareDownloadBundle(transportConfig, syncObjectKey(project.id));
      await dispatchPlan(next, 'download');
    } catch (err) {
      recordFailure('download', project?.id, err);
      showError(t('sync.downloadFailed'), err);
    } finally {
      setBusy(false);
    }
  };

  const handleApplyPolicy = async (): Promise<void> => {
    if (!plan) return;
    setBusy(true);
    try {
      const result = await applySyncPlan(plan, policy);
      if (result.pendingConflicts > 0) {
        registerPendingMerge({ bookId: plan.bookId, kind: mergeKind, bundle: plan.bundle });
      } else {
        clearPendingMerge(plan.bookId);
      }
      setPlan(null);
      setReport(result);
      recordMerge(mergeKind, plan.bookId, result);
      refreshRecords();
    } catch (err) {
      recordFailure(mergeKind, plan.bookId, err);
      showError(t('sync.importFailed'), err);
    } finally {
      setBusy(false);
    }
  };

  /** 重新解决某条已登记冲突：用留档的同步包重新预合并，无需重新导入整包。 */
  const handleResolvePending = async (pending: PendingMergeConflict): Promise<void> => {
    setBusy(true);
    try {
      const next = await prepareBundlePlan(pending.bundle);
      await dispatchPlan(next, pending.kind);
    } catch (err) {
      recordFailure(pending.kind, pending.bookId, err);
      showError(t('sync.importFailed'), err);
    } finally {
      setBusy(false);
    }
  };

  const closeDialog = (next: boolean): void => {
    if (!next && !busy) {
      setOpen(next);
      setPlan(null);
      setReport(null);
      setShowRecovery(false);
    }
  };

  const openSync = (): void => {
    setReport(null);
    setPlan(null);
    setShowRecovery(false);
    setTransportConfig(loadSyncTransportConfig());
    refreshRecords();
    setOpen(true);
  };

  return (
    <>
      {triggerLabel ? (
        <Button variant="outline" size="sm" onClick={openSync} disabled={!project}>
          <ArrowLeftRight className="size-4" />
          {triggerLabel}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={openSync}
          disabled={!project}
          title={t('sync.title')}
        >
          <ArrowLeftRight className="size-4" />
        </Button>
      )}

      {open && project && (
        <ModalShell
          open
          onOpenChange={closeDialog}
          title={t('sync.title')}
          description={t('sync.description')}
          size="lg"
          footer={
            plan ? (
              <>
                <Button variant="outline" onClick={() => closeDialog(false)} disabled={busy}>
                  {t('sync.policyCancel')}
                </Button>
                <Button onClick={() => void handleApplyPolicy()} disabled={busy} aria-busy={busy}>
                  {busy && <Spinner className="size-4" />}
                  {t('sync.policyApply')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => void handleImport()} disabled={busy} aria-busy={busy}>
                  {busy && <Spinner className="size-4" />}
                  {t('sync.import')}
                </Button>
                <Button variant="outline" onClick={() => void handleDownload()} disabled={busy || !ready} aria-busy={busy}>
                  {t('sync.download')}
                </Button>
                <Button variant="outline" onClick={() => void handleExport()} disabled={busy} aria-busy={busy}>
                  {busy && <Spinner className="size-4" />}
                  {t('sync.export')}
                </Button>
                <Button onClick={() => void handleUpload()} disabled={busy || !ready} aria-busy={busy}>
                  {t('sync.upload')}
                </Button>
              </>
            )
          }
        >
          {plan ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t('sync.conflictIntro', { count: plan.conflicts.length })}</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {plan.conflicts.map((c) => (
                  <li key={`${c.entityName}:${c.entityId}`} className="text-xs">
                    <span className="font-medium">{c.title ?? `${c.entityName} · ${c.entityId}`}</span>
                    <span className="ml-2 text-muted-foreground">
                      {c.source === 'copy' ? t('sync.conflictReasonCopy') : t('sync.conflictReasonManual')}
                    </span>
                  </li>
                ))}
              </ul>
              <fieldset className="space-y-2">
                <legend className="mb-1 font-medium">{t('sync.policyLegend')}</legend>
                {POLICIES.map((value) => (
                  <div key={value} className="flex items-start gap-2 rounded-md border border-border p-2">
                    <input
                      type="radio"
                      name="sync-conflict-policy"
                      value={value}
                      checked={policy === value}
                      onChange={() => setPolicy(value)}
                      aria-label={t(`sync.policy.${value}.label`)}
                      className="mt-1 size-4 accent-primary"
                    />
                    <span>
                      <span className="block">{t(`sync.policy.${value}.label`)}</span>
                      <span className="block text-xs text-muted-foreground">{t(`sync.policy.${value}.hint`)}</span>
                    </span>
                  </div>
                ))}
              </fieldset>
            </div>
          ) : report ? (
            <div className="space-y-2 text-sm">
              <div>{t('sync.reportApplied', { count: report.applied })}</div>
              <div>{t('sync.reportSkipped', { count: report.skipped })}</div>
              <div>{t('sync.reportManual', { count: report.manual })}</div>
              {report.pendingConflicts > 0 && (
                <div role="status" className="text-muted-foreground">{t('sync.reportPending', { count: report.pendingConflicts })}</div>
              )}
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

          {!plan && pendingMerges.length > 0 && (
            <div className="mt-4 rounded-md border border-border p-2 text-xs">
              <div className="mb-1 font-medium">{t('sync.pendingMergesTitle')}</div>
              <ul className="space-y-1">
                {pendingMerges.map((pending) => (
                  <li key={pending.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {pending.bookId} · {t(`sync.recoveryKind.${pending.kind}`)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 shrink-0"
                      disabled={busy}
                      onClick={() => void handleResolvePending(pending)}
                    >
                      {t('sync.pendingMergeResolve')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showRecovery}
              onClick={() => setShowRecovery((v) => !v)}
            >
              <History className="size-4" />
              {showRecovery ? t('sync.recoveryHide') : t('sync.recoveryShow')}
            </Button>
            {showRecovery && (
              records.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">{t('sync.recoveryEmpty')}</p>
              ) : (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto" aria-label={t('sync.recoveryTitle')}>
                  {records.map((r) => (
                    <li key={r.id} className="rounded-md border border-border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {t(`sync.recoveryKind.${r.kind}`)}
                          {r.bookId ? ` · ${r.bookId}` : ''}
                        </span>
                        <span className="text-muted-foreground">
                          {t(`sync.recoveryOutcome.${r.outcome}`)} · {new Date(r.at).toLocaleString()}
                        </span>
                      </div>
                      {(r.applied !== undefined || r.conflicts !== undefined) && (
                        <div className="text-muted-foreground">
                          {t('sync.recoveryCounts', {
                            applied: r.applied ?? 0,
                            conflicts: r.conflicts ?? 0,
                          })}
                        </div>
                      )}
                      {r.message && <div className="text-muted-foreground">{r.message}</div>}
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </ModalShell>
      )}
    </>
  );
};

export default SyncDialog;
