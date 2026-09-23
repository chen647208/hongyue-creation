/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { RevisionEntity } from '@core/entities';
import { Bot, Camera, Check, ChevronDown, ChevronLeft, ChevronUp, Copy, History, Redo2, RotateCcw, Trash2, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { appendSnapshot, createSnapshot, listSnapshots, removeSnapshot } from '@/shared/services/chapterSnapshotService';
import { dialogService } from '@/shared/services/dialogService';
import { repository } from '@/shared/services/repository';
import { Button } from '@/shared/ui/Button';
import { DialogTitle } from '@/shared/ui/Dialog';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ModalShell } from '@/shared/ui/ModalShell';
import { cn } from '@/shared/utils/cn';

import type { Chapter } from '../../../../shared/types';
import {
  changeHunks,
  diffChars,
  fromRevisionReviewState,
  matchRevisionBaseline,
  matchSnapshotBaseline,
  mergeRevisionDecisions,
  type RevisionBaseline,
  type RevisionBaselineRef,
  type RevisionDecision,
  stepChangeIndex,
  toRevisionReviewState,
  uniformDecisions,
  withBaselineRef,
} from '../../../editor/revisionDiff';
import { diffLines } from '../services/historyDiff';
import { computeChapterStats } from '../services/writingStatsService';
import { formatHistoryTimestamp, getGenerationType, getProviderIcon } from '../utils';

interface ReviewBaseline {
  label: string;
  /** 基线正文（引用解析结果或全文兜底），用于计算差异。 */
  text: string;
  /** 续存写回侧车字段的基线形式：快照/修订 id 引用优先。 */
  baseline: RevisionBaseline;
}

interface ChapterHistoryModalProps {
  isOpen: boolean;
  chapter: Chapter | null | undefined;
  onClose: () => void;
  onApplyContent: (content: string) => void;
  onClearHistory: () => void;
  onUpdateChapter?: (chapter: Chapter) => void;
}

const DEFAULT_SOURCE_CLS = 'bg-muted text-muted-foreground';
const MANUAL_SOURCE_CLS = 'bg-chart-2/10 text-chart-2';
const BEFORE_CLEAR_SOURCE_CLS = 'bg-destructive/10 text-destructive';

const ChapterHistoryModal: React.FC<ChapterHistoryModalProps> = ({
  isOpen,
  chapter,
  onClose,
  onApplyContent,
  onClearHistory,
  onUpdateChapter,
}) => {
  const { t } = useTranslation('writing');
  const [tab, setTab] = useState<'ai' | 'snapshot' | 'revisions'>('ai');
  const [revisions, setRevisions] = useState<RevisionEntity[]>([]);
  // diff 对比目标记录 id（与当前正文逐行比对，只读展示）
  const [diffRecordId, setDiffRecordId] = useState<string | null>(null);
  // 修订对比：选定版本为基线，逐处接受/拒绝后写回正文（docs/design/38 §2.1）
  const [review, setReview] = useState<ReviewBaseline | null>(null);
  const [decisions, setDecisions] = useState<Record<string, RevisionDecision>>({});
  // 逐处导航的当前改动下标（0 基，越界由 clamp 处理）
  const [activeChangeIndex, setActiveChangeIndex] = useState(0);
  const changeRefs = useRef(new Map<string, HTMLLIElement>());
  const hydratedChapterRef = useRef<string | null>(null);
  /** 最近一次渲染拿到的章节：异步迁移写回时以最新章节为准，避免覆盖期间产生的新决定。 */
  const latestChapterRef = useRef<Chapter | null>(null);
  /** 同步跟随渲染的 onUpdateChapter：迁移写回经 ref 读取， hydration effect 不必重复订阅。 */
  const onUpdateChapterRef = useRef(onUpdateChapter);

  const reviewHunks = useMemo(
    () => (review ? diffChars(review.text, chapter?.content ?? '') : []),
    [review, chapter?.content],
  );
  const reviewChanges = useMemo(() => changeHunks(reviewHunks), [reviewHunks]);
  const reviewMerged = useMemo(() => mergeRevisionDecisions(reviewHunks, decisions), [reviewHunks, decisions]);

  /** 把中间态写回章节侧车字段；缺 onUpdateChapter 时只留会话内（旧调用方）。 */
  const persistReview = (state: { label: string; text: string; baseline: RevisionBaseline; decisions: Record<string, RevisionDecision> } | null) => {
    if (!onUpdateChapter || !chapter) return;
    const next: Chapter = { ...chapter };
    if (state) next.revisionReview = toRevisionReviewState(state.label, state.baseline, state.decisions);
    else delete next.revisionReview;
    onUpdateChapter(next);
  };

  /** 续存基线：快照引用仍有效（快照还在）时写 id；快照已被删则回落全文，保证续审不中断。 */
  const baselineForPersist = (review: ReviewBaseline): RevisionBaseline => {
    const { baseline } = review;
    if (baseline.source === 'snapshot' && !chapter?.snapshots?.some((item) => item.id === baseline.id)) {
      return { source: 'inline', text: review.text };
    }
    return baseline;
  };

  const startReview = (label: string, text: string, baseline: RevisionBaseline) => {
    setDecisions({});
    setReview({ label, text, baseline });
    setActiveChangeIndex(0);
    persistReview({ label, text, baseline, decisions: {} });
  };
  const stopReview = () => {
    setReview(null);
    setDecisions({});
    persistReview(null);
  };
  const decideHunk = (hunkId: string, decision: RevisionDecision) => {
    if (!review) return;
    const next = { ...decisions, [hunkId]: decision };
    setDecisions(next);
    persistReview({ label: review.label, text: review.text, baseline: baselineForPersist(review), decisions: next });
  };
  const decideAll = (decision: RevisionDecision) => {
    if (!review) return;
    const next = Object.fromEntries(uniformDecisions(reviewHunks, decision)) as Record<string, RevisionDecision>;
    setDecisions(next);
    persistReview({ label: review.label, text: review.text, baseline: baselineForPersist(review), decisions: next });
  };

  // 修订记录按需加载：节点 id 即章节 id（bridge 平铺时原样透传）；
  // 应用走正常回写路径（onApplyContent），自然产生一条新修订，无需写回管线
  useEffect(() => {
    if (!isOpen || !chapter || tab !== 'revisions') return;
    let cancelled = false;
    const pending = repository.loadRevisions?.(chapter.id);
    if (!pending) {
      setRevisions([]);
      return;
    }
    pending
      .then((rows) => {
        if (!cancelled) setRevisions([...rows].sort((a, b) => b.seq - a.seq));
      })
      .catch(() => {
        if (!cancelled) setRevisions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, chapter, tab]);

  // 打开时从侧车字段恢复进行中的对比（重开页面可续审）；换章或关闭即重置。
  // 本 effect 是 revisionReview 的唯一读取入口，也是「历史全文基线 → id 引用」读时迁移的唯一落点：
  // 检测旧字段（无 baselineRef）→ 匹配快照/修订 id → 合并当前逐处决定写回，项目文件随即去掉全文副本。
  useEffect(() => {
    latestChapterRef.current = chapter ?? null;
    onUpdateChapterRef.current = onUpdateChapter;
  });

  useEffect(() => {
    if (!isOpen || !chapter) {
      hydratedChapterRef.current = null;
      setReview(null);
      setDecisions({});
      setActiveChangeIndex(0);
      return;
    }
    if (hydratedChapterRef.current === chapter.id) return;
    hydratedChapterRef.current = chapter.id;
    let cancelled = false;

    /** 迁移写回：把解析出的引用并入当前侧车字段（保留当前逐处决定、丢掉全文副本）。 */
    const writeBackRef = (ref: RevisionBaselineRef) => {
      const current = latestChapterRef.current;
      const reviewField = current?.revisionReview;
      // 换章、对比已结束、已是引用格式时都不写回
      if (!current || current.id !== chapter.id || !reviewField || reviewField.baselineRef !== undefined) return;
      const update = onUpdateChapterRef.current;
      if (!update) return;
      update({ ...current, revisionReview: withBaselineRef(reviewField, ref) });
    };

    const loadRevisions = (): Promise<RevisionEntity[] | null> =>
      repository.loadRevisions
        ? repository.loadRevisions(chapter.id).catch(() => null)
        : Promise.resolve(null);

    const restored = fromRevisionReviewState(chapter.revisionReview, chapter);
    if (!restored) {
      setReview(null);
      setDecisions({});
    } else if (restored.text !== null) {
      // 快照引用或全文（历史数据/兜底）已能解析正文
      const snapshotRef = restored.baseline.source === 'inline' ? matchSnapshotBaseline(chapter, restored.text) : null;
      setReview({
        label: restored.label,
        text: restored.text,
        baseline: snapshotRef ?? restored.baseline,
      });
      setDecisions(restored.decisions);
      if (snapshotRef) {
        writeBackRef(snapshotRef);
      } else if (restored.baseline.source === 'inline') {
        // 未匹配快照：再按正文匹配修订记录 id，匹配到才升级（不匹配则保留全文兜底）
        void loadRevisions().then((rows) => {
          if (cancelled || !rows) return;
          const revisionRef = matchRevisionBaseline(rows, restored.text ?? '');
          if (!revisionRef) return;
          setReview((previous) => (previous ? { ...previous, baseline: revisionRef } : previous));
          writeBackRef(revisionRef);
        });
      }
    } else if (restored.baseline.source === 'revision') {
      // 修订 id 引用：正文在 revisions 表，异步载入；引用失效时回落全文兜底
      const ref = restored.baseline;
      void loadRevisions().then((rows) => {
        if (cancelled) return;
        const found = rows?.find((row) => row.id === ref.id);
        const text = found ? found.body : restored.fallbackText;
        if (text === null) {
          setReview(null);
          setDecisions({});
          return;
        }
        setReview({
          label: restored.label,
          text,
          baseline: found ? { source: 'revision', id: ref.id } : { source: 'inline', text },
        });
        setDecisions(restored.decisions);
      });
    } else {
      setReview(null);
      setDecisions({});
    }
    setActiveChangeIndex(0);
    return () => {
      cancelled = true;
    };
  }, [isOpen, chapter]);

  // 逐处导航：进入对比或改动数变化时回到第一处。
  useEffect(() => {
    setActiveChangeIndex(0);
  }, [review, reviewChanges.length]);

  // 键盘导航：Alt+↑/Alt+↓ 切换上一处/下一处（正文输入框聚焦时同样可用）。
  useEffect(() => {
    if (!review || reviewChanges.length === 0) return;
    const handler = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveChangeIndex((index) => stepChangeIndex(index, reviewChanges.length, -1));
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveChangeIndex((index) => stepChangeIndex(index, reviewChanges.length, 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [review, reviewChanges.length]);

  // 当前改动滚入视野。
  useEffect(() => {
    const active = reviewChanges[activeChangeIndex];
    if (active) changeRefs.current.get(active.id)?.scrollIntoView({ block: 'nearest' });
  }, [activeChangeIndex, reviewChanges]);

  if (!isOpen || !chapter) {
    return null;
  }

  const sortedHistory = [...(chapter.history || [])].sort((a, b) => b.timestamp - a.timestamp);
  const snapshots = listSnapshots(chapter);
  const sourceLabels: Record<string, { text: string; cls: string }> = {
    auto: { text: t('chapterHistory.sourceAuto'), cls: DEFAULT_SOURCE_CLS },
    manual: { text: t('chapterHistory.sourceManual'), cls: MANUAL_SOURCE_CLS },
    'before-clear': { text: t('chapterHistory.sourceBeforeClear'), cls: BEFORE_CLEAR_SOURCE_CLS },
    'before-rollback': { text: t('chapterHistory.sourceBeforeRollback'), cls: BEFORE_CLEAR_SOURCE_CLS },
  };
  const fallbackSourceLabel = { text: t('chapterHistory.sourceAuto'), cls: DEFAULT_SOURCE_CLS };

  const applyContentWithSnapshot = (content: string) => {
    if (onUpdateChapter) {
      // 改动前落 before-rollback 快照；应用后结束对比，清掉侧车中间态
      const next: Chapter = { ...appendSnapshot(chapter, createSnapshot(chapter.content ?? '', 'before-rollback')), content };
      delete next.revisionReview;
      onUpdateChapter(next);
    } else {
      onApplyContent(content);
    }
  };

  const handleRestoreSnapshot = (content: string) => {
    applyContentWithSnapshot(content);
    onClose();
  };

  const handleApplyReview = () => {
    applyContentWithSnapshot(reviewMerged);
    dialogService.alert(t('chapterHistory.reviewApplied'));
    onClose();
  };

  const currentCharCount = computeChapterStats(chapter.content ?? '').charCount;
  const mergedCharCount = computeChapterStats(reviewMerged).charCount;

  const reviewView = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {t('chapterHistory.reviewCharSync', { from: currentCharCount, to: mergedCharCount })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1" title={t('chapterHistory.reviewShortcutHint')}>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setActiveChangeIndex((index) => stepChangeIndex(index, reviewChanges.length, -1))}
              disabled={activeChangeIndex <= 0}
              title={t('chapterHistory.reviewPrev')}
              aria-label={t('chapterHistory.reviewPrev')}
            >
              <ChevronUp className="size-3.5" />
            </Button>
            <span className="min-w-[56px] text-center text-2xs tabular-nums text-muted-foreground">
              {t('chapterHistory.reviewProgress', { current: reviewChanges.length ? activeChangeIndex + 1 : 0, total: reviewChanges.length })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setActiveChangeIndex((index) => stepChangeIndex(index, reviewChanges.length, 1))}
              disabled={activeChangeIndex >= reviewChanges.length - 1}
              title={t('chapterHistory.reviewNext')}
              aria-label={t('chapterHistory.reviewNext')}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => decideAll('accept')}>
            <Check className="size-3.5" /> {t('chapterHistory.reviewAcceptAll')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => decideAll('reject')}>
            <X className="size-3.5" /> {t('chapterHistory.reviewRejectAll')}
          </Button>
          <Button size="sm" onClick={handleApplyReview}>
            <Redo2 className="size-3.5" /> {t('chapterHistory.reviewApply')}
          </Button>
        </div>
      </div>

      {reviewChanges.length === 0 ? (
        <EmptyState icon={History} title={t('chapterHistory.reviewEmpty')} description={review?.label ?? ''} />
      ) : (
        <ul className="space-y-2">
          {reviewChanges.map((hunk, index) => {
            const decision = decisions[hunk.id] ?? 'reject';
            return (
              <li
                key={hunk.id}
                ref={(element) => {
                  if (element) changeRefs.current.set(hunk.id, element);
                  else changeRefs.current.delete(hunk.id);
                }}
                className={cn(
                  'rounded-lg border border-border bg-card p-3',
                  index === activeChangeIndex && 'ring-2 ring-primary/50',
                )}
              >
                <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('chapterHistory.reviewChangeLabel', { index: index + 1 })}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{t('chapterHistory.reviewBaseline')}</div>
                    <div
                      className={cn(
                        'whitespace-pre-wrap rounded border p-2 font-serif text-sm',
                        decision === 'accept' ? 'border-success/40 bg-success/10 text-success' : 'border-border bg-muted/30 text-foreground',
                      )}
                    >
                      {hunk.baselineText || ' '}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{t('chapterHistory.reviewCurrent')}</div>
                    <div
                      className={cn(
                        'whitespace-pre-wrap rounded border p-2 font-serif text-sm',
                        decision === 'reject' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border bg-muted/30 text-foreground',
                      )}
                    >
                      {hunk.currentText || ' '}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant={decision === 'accept' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={() => decideHunk(hunk.id, 'accept')}
                  >
                    {t('chapterHistory.reviewAccept')}
                  </Button>
                  <Button
                    variant={decision === 'reject' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={() => decideHunk(hunk.id, 'reject')}
                  >
                    {t('chapterHistory.reviewReject')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <ModalShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }} bare contentClassName="flex h-[85vh] w-[92vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <div className="shrink-0 border-b border-border bg-muted/30 px-6 py-4">
          <DialogTitle className="font-serif text-lg">{t('chapterHistory.title')}</DialogTitle>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('chapterHistory.chapterHeader', { num: chapter.order + 1, title: chapter.title })}
          </p>
          {review ? (
            <div className="mt-2 flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={stopReview}>
                <ChevronLeft className="size-3.5" /> {t('chapterHistory.reviewBack')}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t('chapterHistory.reviewTitle', { label: review.label })}
              </span>
            </div>
          ) : null}
        </div>

        {review ? null : (
        <div className="flex shrink-0 gap-4 border-b border-border bg-card px-6">
          <button
            onClick={() => setTab('ai')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'ai' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Bot className="size-3.5" /> {t('chapterHistory.tabAI', { count: sortedHistory.length })}
          </button>
          <button
            onClick={() => setTab('snapshot')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'snapshot' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Camera className="size-3.5" /> {t('chapterHistory.tabSnapshot', { count: snapshots.length })}
          </button>
          <button
            onClick={() => setTab('revisions')}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'revisions' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <History className="size-3.5" /> {t('chapterHistory.tabRevisions', { count: revisions.length })}
          </button>
        </div>
        )}

        <div className=" flex-1 space-y-3 overflow-y-auto bg-muted/20 p-5">
          {review ? (
            reviewView
          ) : tab === 'snapshot' ? (
            snapshots.length > 0 ? (
              snapshots.map((snap) => {
                const label = sourceLabels[snap.source] ?? fallbackSourceLabel;
                return (
                  <div key={snap.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs font-medium', label.cls)}>{label.text}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{formatHistoryTimestamp(snap.timestamp)}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {t('chapterHistory.charCountInfo', { count: snap.charCount, preview: snap.content.slice(0, 40).replace(/\n/g, ' ') || t('chapterHistory.emptyPreview') })}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startReview(formatHistoryTimestamp(snap.timestamp), snap.content, { source: 'snapshot', id: snap.id })}
                        title={t('chapterHistory.compareAsBaselineTitle')}
                      >
                        <History className="size-3.5" /> {t('chapterHistory.compareAsBaseline')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => handleRestoreSnapshot(snap.content)} title={t('chapterHistory.restoreTitle')}>
                        <RotateCcw className="size-3.5" /> {t('chapterHistory.restore')}
                      </Button>
                      {onUpdateChapter && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => onUpdateChapter(removeSnapshot(chapter, snap.id))}
                          title={t('chapterHistory.deleteSnapshotTitle')}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState icon={Camera} title={t('chapterHistory.noSnapshots')} description={t('chapterHistory.noSnapshotsHint')} />
            )
          ) : tab === 'revisions' ? (
            revisions.length > 0 ? (
              <div className="space-y-3">
                {revisions.map((rev) => (
                  <div key={rev.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">#{rev.seq}</span>
                        <span>{formatHistoryTimestamp(rev.createdAt)}</span>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {t('chapterHistory.revisionAuthor')}: {rev.author}
                        {rev.cause ? ` · ${t('chapterHistory.revisionCause')}: ${rev.cause}` : ''}
                        {` · ${rev.body.slice(0, 60).replace(/\n/g, ' ') || t('chapterHistory.emptyPreview')}`}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startReview(`#${rev.seq}`, rev.body, { source: 'revision', id: rev.id })}
                        title={t('chapterHistory.compareAsBaselineTitle')}
                      >
                        <History className="size-3.5" /> {t('chapterHistory.compareAsBaseline')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          applyContentWithSnapshot(rev.body);
                          onClose();
                        }}
                        title={t('chapterHistory.revisionApplyTitle')}
                      >
                        <Redo2 className="size-3.5" /> {t('chapterHistory.revisionApply')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={History} title={t('chapterHistory.noRevisions')} description={t('chapterHistory.noRevisionsHint')} />
            )
          ) : sortedHistory.length > 0 ? (
            <div className="space-y-4">
              {sortedHistory.map((record) => (
                <div key={record.id} className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-3">
                      {(() => { const { icon: PIcon, cls } = getProviderIcon(record.modelConfig.provider); return <PIcon className={cn('size-5', cls)} />; })()}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{record.modelConfig.modelName}</span>
                          <span className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
                            {getGenerationType(record)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {record.metadata?.templateName || t('chapterHistory.customGeneration')}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-medium text-foreground">{formatHistoryTimestamp(record.timestamp)}</div>
                      <div className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
                        {record.tokens ? `${record.tokens.total} tokens` : 'N/A tokens'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-5">
                    <div>
                      <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('chapterHistory.promptLabel')}</div>
                      <div className=" max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground/80">
                        {record.prompt}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('chapterHistory.contentLabel')}</div>
                      <div className=" max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-primary/20 bg-primary/5 p-3 font-serif text-sm leading-relaxed text-foreground">
                        {record.generatedContent}
                      </div>
                      <div className="mt-1.5 text-right text-xs tabular-nums text-muted-foreground">
                        {t('chapterHistory.lengthInfo', { count: record.generatedContent.length })}
                      </div>
                    </div>

                    {diffRecordId === record.id && (
                      <div>
                        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('chapterHistory.diffLabel')}</div>
                        <div className=" max-h-64 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                          {diffLines(record.generatedContent, chapter.content || '').map((line, i) => (
                            <div
                              key={i}
                              className={cn(
                                'whitespace-pre-wrap rounded px-1.5 py-0.5',
                                line.type === 'add' && 'bg-success/10 text-success',
                                line.type === 'del' && 'bg-destructive/10 text-destructive',
                                line.type === 'same' && 'text-muted-foreground'
                              )}
                            >
                              {line.type === 'add' ? '+ ' : line.type === 'del' ? '- ' : '  '}{line.text || ' '}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('chapterHistory.modelConfigLabel')}</div>
                        <div className="space-y-1">
                          <div className="text-sm text-foreground/80">
                            <span className="font-medium">{t('chapterHistory.providerLabel')}</span> {record.modelConfig.provider}
                          </div>
                          {record.modelConfig.temperature !== undefined && (
                            <div className="text-sm text-foreground/80">
                              <span className="font-medium">{t('chapterHistory.temperatureLabel')}</span> {record.modelConfig.temperature}
                            </div>
                          )}
                          {record.modelConfig.maxTokens !== undefined && (
                            <div className="text-sm text-foreground/80">
                              <span className="font-medium">{t('chapterHistory.maxTokensLabel')}</span> {record.modelConfig.maxTokens}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('record.tokenUsage')}</div>
                        <div className="space-y-1">
                          <div className="text-sm tabular-nums text-foreground/80"><span className="font-medium">{t('chapterHistory.inputLabel')}</span> {record.tokens?.prompt || 'N/A'}</div>
                          <div className="text-sm tabular-nums text-foreground/80"><span className="font-medium">{t('chapterHistory.outputLabel')}</span> {record.tokens?.completion || 'N/A'}</div>
                          <div className="text-sm tabular-nums text-foreground/80"><span className="font-medium">{t('chapterHistory.totalLabel')}</span> {record.tokens?.total || 'N/A'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-border pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDiffRecordId((v) => (v === record.id ? null : record.id))}
                      >
                        {t('chapterHistory.compare')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(record.generatedContent);
                          dialogService.alert(t('record.copied'));
                        }}
                      >
                        <Copy className="size-3.5" /> {t('record.copyContent')}
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          applyContentWithSnapshot(record.generatedContent);
                          onClose();
                        }}
                      >
                        <Redo2 className="size-3.5" /> {t('chapterHistory.reapply')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={History} title={t('chapterHistory.noHistory')} description={t('chapterHistory.noHistoryHint')} />
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/30 px-6 py-4">
          <div className="text-xs text-muted-foreground">{t('chapterHistory.footerCount', { count: chapter.history?.length || 0 })}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={onClearHistory}>
              <Trash2 className="size-3.5" /> {t('chapterHistory.clearHistory')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('chapterHistory.close')}
            </Button>
          </div>
        </div>
    </ModalShell>
  );
};

export default ChapterHistoryModal;
