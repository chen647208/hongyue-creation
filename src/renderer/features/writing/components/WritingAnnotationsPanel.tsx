/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 行内批注面板（docs/design/38 §2.2）：线程列表、回复、解决/重开、删除与失锚提示。
 * 批注为侧车数据，只读消费 Chapter.annotations；不写正文，不参与字数与导出。
 */

import { MessageSquarePlus } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';

import type { ChapterAnnotation } from '../../../../shared/types';
import { resolveAnnotation } from '../../../editor/annotations';
import type { WritingAnnotationsPanelProps } from '../types';
import { formatHistoryTimestamp } from '../utils';

const WritingAnnotationsPanel: React.FC<WritingAnnotationsPanelProps> = ({
  activeChapterId,
  annotations,
  blockTexts,
  onJump,
  onAddFromSelection,
  onReply,
  onUpdateBody,
  onResolve,
  onReopen,
  onDelete,
}) => {
  const { t } = useTranslation('writing');
  const [openReplyId, setOpenReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const unresolved = annotations.filter((a) => !a.resolved);
  const resolved = annotations.filter((a) => a.resolved);

  const submitReply = (id: string) => {
    onReply(id, replyText);
    setReplyText('');
    setOpenReplyId(null);
  };

  const submitEdit = (id: string) => {
    onUpdateBody(id, editText);
    setEditId(null);
    setEditText('');
  };

  const renderThread = (annotation: ChapterAnnotation) => {
    const resolvedAnchor = resolveAnnotation(annotation, blockTexts);
    const orphaned = resolvedAnchor.status === 'orphaned';
    return (
      <li key={annotation.id} className="rounded border border-border/60 bg-muted/20 p-2 text-xs">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => onJump(annotation.anchor.blockId)}
            title={t('annotations.jump')}
            aria-label={t('annotations.jump')}
          >
            <span className="block truncate font-medium text-foreground">
              「{annotation.anchor.quote || t('annotations.emptyQuote')}」
            </span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {annotation.author} · {formatHistoryTimestamp(annotation.createdAt)}
            </span>
          </button>
          {orphaned ? (
            <span
              className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive"
              title={t('annotations.orphanHint')}
            >
              {t('annotations.orphanBadge')}
            </span>
          ) : null}
        </div>

        {editId === annotation.id ? (
          <div className="mt-2 space-y-1">
            <textarea
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              aria-label={t('annotations.commentLabel')}
              className="min-h-[48px] w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
            />
            <div className="flex gap-1">
              <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => submitEdit(annotation.id)}>
                {t('annotations.save')}
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setEditId(null)}>
                {t('annotations.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-foreground/90">{annotation.body}</p>
        )}

        {annotation.replies.length > 0 ? (
          <ul className="mt-2 space-y-1 border-l border-border/60 pl-2">
            {annotation.replies.map((reply) => (
              <li key={reply.id}>
                <span className="text-[10px] text-muted-foreground">
                  {reply.author} · {formatHistoryTimestamp(reply.createdAt)}
                </span>
                <p className="whitespace-pre-wrap text-foreground/90">{reply.body}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {openReplyId === annotation.id ? (
          <div className="mt-2 flex gap-1">
            <input
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder={t('annotations.replyPlaceholder')}
              aria-label={t('annotations.replyPlaceholder')}
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitReply(annotation.id);
              }}
            />
            <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => submitReply(annotation.id)}>
              {t('annotations.send')}
            </Button>
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => { setOpenReplyId(annotation.id); setReplyText(''); }}>
            {t('annotations.reply')}
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => { setEditId(annotation.id); setEditText(annotation.body); }}>
            {t('annotations.edit')}
          </Button>
          {annotation.resolved ? (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => onReopen(annotation.id)}>
              {t('annotations.reopen')}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => onResolve(annotation.id)}>
              {t('annotations.resolve')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
            onClick={() => {
              void dialogService.confirm({ message: t('annotations.deleteConfirm'), danger: true }).then((ok) => {
                if (ok) onDelete(annotation.id);
              });
            }}
          >
            {t('annotations.delete')}
          </Button>
        </div>
      </li>
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('annotations.title')} ({unresolved.length})
        </h4>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px]"
          onClick={onAddFromSelection}
          disabled={!activeChapterId}
          title={t('annotations.addHint')}
        >
          <MessageSquarePlus className="size-3.5" /> {t('annotations.add')}
        </Button>
      </div>

      {!activeChapterId ? (
        <p className="text-xs text-muted-foreground">{t('annotations.noActive')}</p>
      ) : unresolved.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('annotations.empty')}</p>
      ) : (
        <ul className="space-y-1">{unresolved.map(renderThread)}</ul>
      )}

      {resolved.length > 0 ? (
        <details className="rounded border border-border/60 bg-muted/10 p-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            {t('annotations.resolvedTitle')} ({resolved.length})
          </summary>
          <ul className="mt-2 space-y-1">{resolved.map(renderThread)}</ul>
        </details>
      ) : null}
    </section>
  );
};

export default WritingAnnotationsPanel;
