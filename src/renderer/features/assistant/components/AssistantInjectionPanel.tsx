/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 自动注入上下文面板（docs/design/37 §3）：显示最近一次会话实际注入的条目、来源与预算占用，
 * 可整体关闭，也可逐条取消（下次会话生效）。只读 + 开关，不改数据。
 */
import type { ContextInjectionResult } from '@core/ai';
import { Layers } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';

interface AssistantInjectionPanelProps {
  injection: ContextInjectionResult | null;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  disabledIds: string[];
  onToggleEntry: (id: string) => void;
  onClose: () => void;
}

const AssistantInjectionPanel: React.FC<AssistantInjectionPanelProps> = ({
  injection,
  enabled,
  onEnabledChange,
  disabledIds,
  onToggleEntry,
  onClose,
}) => {
  const { t } = useTranslation('assistant');
  const disabled = new Set(disabledIds);
  const ratio = injection && injection.budgetChars > 0
    ? Math.min(100, Math.round((injection.totalChars / injection.budgetChars) * 100))
    : 0;

  return (
    <div className="absolute inset-0 top-[88px] z-10 flex flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
        <Layers className="size-4 text-primary" />
        <span className="text-sm font-medium">{t('injection.title')}</span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs text-muted-foreground" onClick={onClose}>
          {t('injection.close')}
        </Button>
      </div>

      <div className="shrink-0 space-y-2 border-b border-border bg-card px-4 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            className="size-3.5 accent-primary"
          />
          {t('injection.enableLabel')}
        </label>
        {injection && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-2xs text-muted-foreground">
              <span>{t('injection.budgetLabel')}</span>
              <span className="tabular-nums">{injection.totalChars} / {injection.budgetChars}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
              <div
                className={ratio >= 100 ? 'h-full bg-destructive' : 'h-full bg-primary'}
                style={{ width: `${ratio}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4 text-xs">
        {!injection && <div className="py-8 text-center text-muted-foreground">{t('injection.empty')}</div>}
        {injection && !injection.enabled && (
          <div className="py-8 text-center text-muted-foreground">{t('injection.disabledHint')}</div>
        )}
        {injection?.enabled && injection.entries.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">{t('injection.noEntries')}</div>
        )}
        {injection?.enabled && injection.entries.map((entry) => (
          <div key={entry.id} className="rounded-md border border-border bg-card p-2">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={!disabled.has(entry.id)}
                onChange={() => onToggleEntry(entry.id)}
                className="mt-0.5 size-3.5 accent-primary"
              />
              <span className="sr-only">{entry.title}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">{entry.title}</span>
                  <Badge variant="secondary" className="shrink-0 text-2xs">{t(`injection.kind.${entry.source.kind}`)}</Badge>
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{entry.text.length}</span>
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  {entry.trigger} · {entry.source.title}{entry.source.locator ? ` / ${entry.source.locator}` : ''}
                </span>
              </span>
            </label>
          </div>
        ))}

        {injection && injection.dropped.length > 0 && (
          <div className="space-y-1 border-t border-border pt-2">
            <div className="text-2xs uppercase tracking-wider text-muted-foreground">{t('injection.droppedTitle')}</div>
            {injection.dropped.map((item, index) => (
              <div key={`${item.id}-${index}`} className="flex items-center justify-between text-muted-foreground">
                <span className="truncate">{item.title}</span>
                <span className="ml-2 shrink-0 text-2xs">
                  {item.reason === 'budget' ? t('injection.reasonBudget')
                    : item.reason === 'quote-mismatch' ? t('injection.reasonQuote')
                    : t('injection.reasonDisabled')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssistantInjectionPanel;
