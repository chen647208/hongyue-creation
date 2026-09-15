/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 会话事件流浏览器：AI 历史（jsonl 归档）的回放视图。 */
import type { AiEvent } from '@core/ai';
import type { TFunction } from 'i18next';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { LoadingState } from '@/shared/ui/LoadingState';

import { filterSessionEntries, listSessionArchives, type SessionArchiveEntry,summarizeSessionUsage } from '../services/sessionArchive';
import { renameSession, setSessionArchived } from '../services/sessionIndexService';

function eventLine(e: AiEvent, t: TFunction<'assistant'>): { label: string; tone: 'ok' | 'err' | 'muted' } {
  switch (e.t) {
    case 'session.start':
      return { label: t('events.sessionStart', { task: e.task }), tone: 'ok' };
    case 'message':
      return {
        label: e.role === 'user'
          ? t('events.userMessage', { text: e.content.slice(0, 160) })
          : t('events.assistantMessage', { text: e.content.slice(0, 160) }),
        tone: e.role === 'user' ? 'muted' : 'ok',
      };
    case 'turn.start':
      return { label: t('events.turnStart', { turn: e.turn }), tone: 'muted' };
    case 'llm.request':
      return { label: t('events.llmRequest', { model: e.model, chars: e.promptChars }), tone: 'muted' };
    case 'llm.done': {
      const tokens = e.tokens as
        | { prompt?: number; completion?: number; cacheRead?: number }
        | undefined;
      const parts = [
        t('events.input', { n: tokens?.prompt ?? 0 }),
        t('events.output', { n: tokens?.completion ?? 0 }),
      ];
      if ((tokens?.cacheRead ?? 0) > 0) parts.push(t('events.cacheRead', { n: tokens?.cacheRead ?? 0 }));
      return { label: t('events.llmDone', { parts: parts.join(' · ') }), tone: 'ok' };
    }
    case 'llm.error':
      return { label: t('events.llmError', { error: e.error }), tone: 'err' };
    case 'tool.call':
      return { label: t('events.toolCall', { toolId: e.toolId, args: JSON.stringify(e.args).slice(0, 120) }), tone: 'muted' };
    case 'tool.approval':
      return { label: t('events.toolApproval', { verdict: e.verdict, by: e.by }), tone: e.verdict === 'approved' ? 'ok' : 'err' };
    case 'tool.result':
      return { label: e.ok ? t('events.toolResultOk') : t('events.toolResultFail', { error: e.error ?? '' }), tone: e.ok ? 'ok' : 'err' };
    case 'write.direct':
      return { label: t('events.writeDirect', { toolId: e.toolId }), tone: 'muted' };
    case 'context.injection':
      return { label: t('events.contextInjection', { entries: e.entries, chars: e.totalChars, budget: e.budgetChars, dropped: e.dropped }), tone: 'muted' };
    case 'turn.end':
      return { label: t('events.turnEnd', { turns: e.turns }), tone: 'muted' };
    case 'session.end':
      return { label: e.ok ? t('events.sessionEndOk') : t('events.sessionEndFail', { error: e.error ?? '' }), tone: e.ok ? 'ok' : 'err' };
    case 'mcp.sync':
      return { label: e.ok ? t('events.mcpSyncOk') : t('events.mcpSyncFail', { error: e.error ?? '' }), tone: e.ok ? 'ok' : 'err' };
    default:
      return { label: e.t, tone: 'muted' };
  }
}

/** 单会话用量汇总条（输入/输出/缓存命中/工具次数）。 */
const SessionUsageBar: React.FC<{ events: AiEvent[] }> = ({ events }) => {
  const { t } = useTranslation('assistant');
  const summary = React.useMemo(() => summarizeSessionUsage(events), [events]);
  if (!summary.llmCalls) return null;
  return (
    <div className="mb-2 rounded-md bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
      {t('approval.usageSummary', {
        prompt: summary.prompt,
        completion: summary.completion,
        cached: summary.cacheRead,
        tools: summary.toolCalls,
      })}
    </div>
  );
};

const SessionEventBrowser: React.FC<{ bookId: string }> = ({ bookId }) => {
  const { t } = useTranslation('assistant');
  const [sessions, setSessions] = useState<SessionArchiveEntry[] | null>(null);
  const [selected, setSelected] = useState<SessionArchiveEntry | null>(null);
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    let alive = true;
    listSessionArchives(bookId)
      .then((entries) => {
        if (!alive) return;
        setSessions(entries);
        // 元数据变更后刷新选中项，避免按钮/名称显示陈旧
        setSelected((prev) => (prev ? entries.find((e) => e.sessionId === prev.sessionId) ?? prev : prev));
      })
      .catch(() => {
        if (alive) setSessions([]);
      });
    return () => {
      alive = false;
    };
  }, [bookId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  if (sessions === null) {
    return <LoadingState className="py-16" />;
  }

  if (!sessions.length) {
    return <div className="py-16 text-center text-sm text-muted-foreground">{t('approval.eventNoSessions')}</div>;
  }

  const visible = filterSessionEntries(sessions, query, includeArchived);

  const commitRename = () => {
    if (!selected) return;
    renameSession(bookId, selected.sessionId, nameDraft);
    reload();
  };

  const toggleArchive = () => {
    if (!selected) return;
    setSessionArchived(bookId, selected.sessionId, !selected.archived);
    reload();
  };

  const exportMarkdown = () => {
    if (!selected) return;
    const lines = [
      `# ${selected.task ?? selected.sessionId}`,
      '',
      ...selected.events.map((e) => `- ${eventLine(e, t).label}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `session-${selected.sessionId}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('approval.eventSearchPlaceholder')}
        className="h-8 text-xs"
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
          className="size-3.5 accent-primary"
        />
        {t('approval.eventShowArchived')}
      </label>
      <div className="flex flex-wrap gap-2">
        {visible.map((s) => (
          <Button
            key={s.sessionId}
            size="sm"
            variant={selected?.sessionId === s.sessionId ? 'default' : 'outline'}
            onClick={() => { setSelected(s); setNameDraft(s.name ?? ''); }}
          >
            {new Date(s.startedAt ?? 0).toLocaleString()} · {(s.name ?? s.task ?? '').slice(0, 18)}
            {s.archived ? ` · ${t('approval.eventArchived')}` : ''}
          </Button>
        ))}
      </div>

      {selected && (
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant={selected.ok === false ? 'destructive' : 'secondary'}>
              {selected.ok === false ? t('approval.eventFailed') : t('approval.eventDone')}
            </Badge>
            <span className="text-xs text-muted-foreground">{selected.events.length} events</span>
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs text-muted-foreground" onClick={exportMarkdown}>
              {t('approval.eventExportMd')}
            </Button>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={t('approval.eventRenamePlaceholder')}
              className="h-7 flex-1 text-xs"
              aria-label={t('approval.eventRenamePlaceholder')}
            />
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={commitRename}>
              {t('approval.eventRename')}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={toggleArchive}>
              {selected.archived ? t('approval.eventRestore') : t('approval.eventArchive')}
            </Button>
          </div>
          <SessionUsageBar events={selected.events} />
          <div className="max-h-80 space-y-1 overflow-auto font-mono text-xs">
            {selected.events.map((e, i) => {
              const { label, tone } = eventLine(e, t);
              return (
                <div
                  key={i}
                  className={
                    tone === 'ok' ? 'cv-auto text-success' : tone === 'err' ? 'cv-auto text-destructive' : 'cv-auto text-muted-foreground'
                  }
                >
                  {new Date('at' in e ? e.at : 0).toLocaleTimeString()}  {label}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionEventBrowser;
