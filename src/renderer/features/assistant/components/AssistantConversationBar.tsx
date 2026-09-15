/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 多对话标签栏：切换/新建/删除对话线程 + 从归档恢复；键盘可达（方向键/Home/End）。 */
import { History, Plus, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { cn } from '@/shared/utils/cn';

import { type AssistantConversation,conversationDisplayTitle } from '../hooks/useAssistantConversations';
import { filterSessionEntries,listSessionArchives, type SessionArchiveEntry } from '../services/sessionArchive';

interface AssistantConversationBarProps {
  conversations: AssistantConversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRestore: (entry: SessionArchiveEntry) => void;
  bookId: string | null;
}

const AssistantConversationBar: React.FC<AssistantConversationBarProps> = ({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRestore,
  bookId,
}) => {
  const { t } = useTranslation('assistant');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [archives, setArchives] = useState<SessionArchiveEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!historyOpen || !bookId) return;
    let alive = true;
    listSessionArchives(bookId)
      .then((entries) => {
        if (alive) setArchives(entries);
      })
      .catch(() => {
        if (alive) setArchives([]);
      });
    return () => {
      alive = false;
    };
  }, [historyOpen, bookId]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const currentIndex = conversations.findIndex((c) => c.id === activeId);
    if (currentIndex < 0) return;
    let next = currentIndex;
    if (event.key === 'ArrowRight') next = (currentIndex + 1) % conversations.length;
    else if (event.key === 'ArrowLeft') next = (currentIndex - 1 + conversations.length) % conversations.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = conversations.length - 1;
    else return;
    event.preventDefault();
    const target = conversations[next];
    if (!target) return;
    onSelect(target.id);
    tabRefs.current[next]?.focus();
  };

  const visibleArchives = archives ? filterSessionEntries(archives, query, false) : [];

  return (
    <div className="shrink-0 border-b border-border bg-muted/10">
      <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
        <div role="tablist" aria-label={t('conversation.listLabel')} tabIndex={-1} className="flex min-w-0 items-center gap-1" onKeyDown={handleKeyDown}>
          {conversations.map((conversation, index) => {
            const title = conversationDisplayTitle(conversation) || t('conversation.untitled');
            const active = conversation.id === activeId;
            return (
              <div key={conversation.id} className="group flex shrink-0 items-center">
                <button
                  ref={(el) => { tabRefs.current[index] = el; }}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onSelect(conversation.id)}
                  className={cn(
                    'max-w-[160px] truncate rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                  title={title}
                >
                  {title}
                </button>
                {conversations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDelete(conversation.id)}
                    aria-label={t('conversation.delete')}
                    title={t('conversation.delete')}
                    className="ml-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNew}
          className="ml-auto size-7 shrink-0 text-muted-foreground hover:text-foreground"
          title={t('conversation.new')}
          aria-label={t('conversation.new')}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setHistoryOpen((v) => !v)}
          className={cn('size-7 shrink-0 text-muted-foreground hover:text-foreground', historyOpen && 'bg-primary/10 text-primary')}
          title={t('conversation.history')}
          aria-label={t('conversation.history')}
          aria-expanded={historyOpen}
        >
          <History className="size-3.5" />
        </Button>
      </div>

      {historyOpen && (
        <div className="border-t border-border bg-card px-2 py-2">
          {!bookId ? (
            <p className="px-1 text-xs text-muted-foreground">{t('conversation.noBook')}</p>
          ) : (
            <>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('approval.eventSearchPlaceholder')}
                className="mb-2 h-7 text-xs"
                aria-label={t('approval.eventSearchPlaceholder')}
              />
              {archives === null ? (
                <p className="px-1 text-xs text-muted-foreground">{t('conversation.loading')}</p>
              ) : visibleArchives.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{t('conversation.historyEmpty')}</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {visibleArchives.map((entry) => (
                    <li key={entry.sessionId} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1">
                      <span className="min-w-0 truncate text-xs text-foreground" title={entry.name ?? entry.task ?? entry.sessionId}>
                        {new Date(entry.startedAt ?? 0).toLocaleString()} · {(entry.name ?? entry.task ?? entry.sessionId).slice(0, 24)}
                      </span>
                      <Button size="sm" variant="outline" className="h-6 shrink-0 text-2xs" onClick={() => { onRestore(entry); setHistoryOpen(false); }}>
                        {t('conversation.restore')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AssistantConversationBar;
