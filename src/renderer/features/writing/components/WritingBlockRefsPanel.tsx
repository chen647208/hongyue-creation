/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 块引用面板（docs/design/45 §4）：反向引用、本块出链、失链与插入入口。
 * 只读消费块引用图，数据变化由 WritingEditor 重算后传入。
 */

import React, { useMemo,useState } from 'react';
import { useTranslation } from 'react-i18next';

import { dialogService } from '@/shared/services/dialogService';
import { Button } from '@/shared/ui/Button';

import type { BlockRefSite } from '../../../editor/blockRefs';
import { backlinksOf, checkBlockRefInsertion, outgoingOf } from '../../../editor/blockRefs';
import type { WritingBlockRefsPanelProps } from '../types';

const WritingBlockRefsPanel: React.FC<WritingBlockRefsPanelProps> = ({
  index,
  activeBlockId,
  onInsertRef,
  onInsertEmbed,
  onJump,
}) => {
  const { t } = useTranslation('writing');
  const [query, setQuery] = useState('');

  const active = activeBlockId ? index.blocks.get(activeBlockId) : undefined;
  const incoming = backlinksOf(index, activeBlockId);
  const outgoing = outgoingOf(index, activeBlockId);

  const candidates = useMemo(() => {
    const all = [...index.blocks.values()];
    const q = query.trim().toLowerCase();
    const matched = q
      ? all.filter((block) => block.text.toLowerCase().includes(q) || block.id.toLowerCase().includes(q))
      : all;
    return matched.slice(0, 50);
  }, [index, query]);

  const tryInsert = (targetId: string, kind: 'ref' | 'embed') => {
    const check = checkBlockRefInsertion(index, activeBlockId, targetId, kind);
    if (!check.ok) {
      dialogService.alert(check.reason === 'self' ? t('blockRefs.selfRejected') : t('blockRefs.cycleRejected'));
      return;
    }
    if (kind === 'embed') onInsertEmbed(targetId);
    else onInsertRef(targetId);
  };

  const renderSite = (site: BlockRefSite, key: string) => (
    <li key={key} className="rounded border border-border/60 bg-muted/30 p-2 text-xs">
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => onJump(site.sourceBlockId ?? site.targetId)}
      >
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {site.kind === 'embed' ? t('blockRefs.kindEmbed') : t('blockRefs.kindRef')} · {site.chapterTitle}
        </span>
        <span className="mt-0.5 block truncate text-foreground">{site.sourceText || site.targetId}</span>
      </button>
    </li>
  );

  return (
    <section className="space-y-4">
      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('blockRefs.title')}</h4>

      <div className="rounded border border-border/60 bg-muted/20 p-2 text-xs">
        <span className="text-muted-foreground">{t('blockRefs.activeLabel')}: </span>
        {active ? <span className="text-foreground">{active.text || active.id}</span> : <span className="text-muted-foreground">{t('blockRefs.noActive')}</span>}
      </div>

      <div>
        <h5 className="mb-1 text-xs font-medium text-muted-foreground">{t('blockRefs.backlinksTitle')} ({incoming.length})</h5>
        {incoming.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('blockRefs.backlinksEmpty')}</p>
        ) : (
          <ul className="space-y-1">{incoming.map((site, i) => renderSite(site, `in-${i}`))}</ul>
        )}
      </div>

      <div>
        <h5 className="mb-1 text-xs font-medium text-muted-foreground">{t('blockRefs.outgoingTitle')} ({outgoing.length})</h5>
        {outgoing.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('blockRefs.outgoingEmpty')}</p>
        ) : (
          <ul className="space-y-1">
            {outgoing.map((site, i) => {
              const exists = index.blocks.has(site.targetId);
              return (
                <li key={`out-${i}`} className="rounded border border-border/60 bg-muted/30 p-2 text-xs">
                  <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => onJump(site.targetId)}>
                    <span className="truncate text-foreground">{index.blocks.get(site.targetId)?.text ?? site.targetId}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {site.kind === 'embed' ? t('blockRefs.kindEmbed') : t('blockRefs.kindRef')}
                    </span>
                  </button>
                  {exists ? null : <span className="mt-1 block text-[10px] text-destructive">{t('blockRefs.targetMissing')}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {index.broken.length > 0 && (
        <div>
          <h5 className="mb-1 text-xs font-medium text-destructive">{t('blockRefs.brokenTitle')} ({index.broken.length})</h5>
          <ul className="space-y-1">
            {index.broken.slice(0, 20).map((site, i) => (
              <li key={`broken-${i}`} className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs">
                <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => onJump(site.sourceBlockId ?? site.targetId)}>
                  <span className="truncate">{site.sourceText || site.targetId}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{t('blockRefs.jump')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h5 className="mb-1 text-xs font-medium text-muted-foreground">{t('blockRefs.insertTitle')}</h5>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('blockRefs.searchPlaceholder')}
          className="mb-2 w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
        />
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('blockRefs.empty')}</p>
        ) : (
          <ul className="space-y-1">
            {candidates.map((block) => (
              <li key={block.id} className="rounded border border-border/60 bg-muted/20 p-2 text-xs">
                <span className="block truncate text-foreground">{block.text || block.id}</span>
                <span className="mt-1 flex gap-1">
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => tryInsert(block.id, 'ref')}>
                    {t('blockRefs.insertRef')}
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => tryInsert(block.id, 'embed')}>
                    {t('blockRefs.insertEmbed')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default WritingBlockRefsPanel;
