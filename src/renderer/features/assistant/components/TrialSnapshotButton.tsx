/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** AI 试错回滚入口：列出本会话每次工具事务前的快照，可回滚到任意一步。 */
import type { Project } from '@shared/types';
import { RotateCcw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Select';

import { aiTrialSnapshots } from '../services/aiTrialSnapshotService';

interface TrialSnapshotButtonProps {
  projectId?: string;
  onUpdate: (updates: Partial<Project>) => void;
}

const TrialSnapshotButton: React.FC<TrialSnapshotButtonProps> = ({ projectId, onUpdate }) => {
  const { t } = useTranslation('assistant');
  const [confirming, setConfirming] = useState(false);
  const latest = aiTrialSnapshots.latestForBook(projectId);
  const latestId = latest?.id ?? '';
  const [selectedId, setSelectedId] = useState(latestId);

  // 新快照到达时默认选中最新的那一步
  useEffect(() => {
    if (latestId) setSelectedId(latestId);
  }, [latestId]);

  if (!latest) return null;

  const steps = aiTrialSnapshots.list(latest.sessionId);
  const selected = steps.find((step) => step.id === selectedId) ?? latest;

  const rollback = () => {
    const chapters = aiTrialSnapshots.rollback(selected.id);
    if (chapters) onUpdate({ chapters });
    setConfirming(false);
  };

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-1.5">
      <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">{t('trial.label', { label: selected.label })}</span>
      {steps.length > 1 && (
        <Select
          value={selected.id}
          onChange={(event) => { setSelectedId(event.target.value); setConfirming(false); }}
          className="h-6 w-auto max-w-[45%] text-2xs"
          aria-label={t('trial.pickStep')}
        >
          {steps.map((step) => (
            <option key={step.id} value={step.id}>{t('trial.step', { n: step.step + 1, label: step.label })}</option>
          ))}
        </Select>
      )}
      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="secondary" className="h-6 px-2 text-2xs" onClick={rollback}>{t('trial.confirm')}</Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-2xs" onClick={() => setConfirming(false)}>{t('trial.cancel')}</Button>
        </span>
      ) : (
        <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-2xs" onClick={() => setConfirming(true)}>
          <RotateCcw className="size-3" />{t('trial.rollback')}
        </Button>
      )}
    </div>
  );
};

export default TrialSnapshotButton;
