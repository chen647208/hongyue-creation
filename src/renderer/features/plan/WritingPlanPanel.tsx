/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 写作计划看板：选题→大纲→章节→修订→校验五列，条目可勾选/改阶段/删除并落盘。 */
import type { PlanItem, PlanStage } from '@shared/types';
import { Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import { selectActiveProject, useProjectStore } from '@/app/stores/projectStore';
import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Input } from '@/shared/ui/Input';
import { cn } from '@/shared/utils/cn';

import { addPlanItem, itemsByStage, movePlanItem, PLAN_STAGES, removePlanItem, togglePlanStatus } from './planService';

const WritingPlanPanel: React.FC = () => {
  const { t } = useTranslation('steps');
  const project = useProjectStore(selectActiveProject);
  const updateActiveProject = useProjectStore((state) => state.updateActiveProject);
  const [drafts, setDrafts] = useState<Partial<Record<PlanStage, string>>>({});

  if (!project) return null;
  const plan = project.plan ?? [];
  const setPlan = (next: PlanItem[]) => updateActiveProject({ plan: next });

  const stageLabel = (stage: PlanStage): string => {
    switch (stage) {
      case 'theme':
        return t('plan.stage.theme');
      case 'outline':
        return t('plan.stage.outline');
      case 'chapter':
        return t('plan.stage.chapter');
      case 'revision':
        return t('plan.stage.revision');
      case 'check':
        return t('plan.stage.check');
      default:
        return stage;
    }
  };

  const add = (stage: PlanStage) => {
    const title = (drafts[stage] ?? '').trim();
    if (!title) return;
    setPlan(addPlanItem(plan, stage, title, `plan:${crypto.randomUUID()}`));
    setDrafts((prev) => ({ ...prev, [stage]: '' }));
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex min-w-[760px] flex-col gap-3">
        <p className="text-xs text-muted-foreground">{t('plan.subtitle')}</p>
        <div className="grid grid-cols-5 gap-3">
          {PLAN_STAGES.map((stage) => (
            <div key={stage} className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium">{stageLabel(stage)}</span>
                <span className="text-2xs text-muted-foreground">{itemsByStage(plan, stage).length}</span>
              </div>
              <div className="space-y-1">
                {itemsByStage(plan, stage).map((item) => (
                  <div key={item.id} className="rounded border border-border p-1.5 text-xs">
                    <div className="flex items-start gap-1.5">
                      <Checkbox checked={item.status === 'done'} onChange={() => setPlan(togglePlanStatus(plan, item.id))} className="mt-0.5" />
                      <span className={cn('min-w-0 flex-1 break-words', item.status === 'done' && 'text-muted-foreground line-through')}>{item.title}</span>
                      <button type="button" aria-label={t('plan.remove')} onClick={() => setPlan(removePlanItem(plan, item.id))} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                    <select
                      aria-label={t('plan.move')}
                      value={item.stage}
                      onChange={(event) => setPlan(movePlanItem(plan, item.id, event.target.value as PlanStage, Number.MAX_SAFE_INTEGER))}
                      className="mt-1 h-6 w-full rounded border border-border bg-background px-1 text-2xs text-muted-foreground"
                    >
                      {PLAN_STAGES.map((value) => (
                        <option key={value} value={value}>{stageLabel(value)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Input
                  value={drafts[stage] ?? ''}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [stage]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') add(stage);
                  }}
                  placeholder={t('plan.addPlaceholder')}
                  className="h-7 text-2xs"
                />
                <Button size="icon" variant="ghost" className="size-7 shrink-0" aria-label={t('plan.add')} onClick={() => add(stage)}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WritingPlanPanel;
