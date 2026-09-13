/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 双轴时间线：上轴叙事顺序（章节），下轴故事时间（事件），可拖拽排序、吸附、合并、检查。 */
import type { Project } from '@shared/types';
import { AlertTriangle, Check, Flag, GitMerge, Search, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useGenericModelStore } from '@/app/stores/genericModelStore';
import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/Card';
import { cn } from '@/shared/utils/cn';

import { checkTimelineConsistency, type TimelineIssue } from './timelineConsistency';
import { buildTimelineModel, snapTo, type TimelineAxisId, type TimelineClip, type TimelineModel } from './timelineModel';

interface DualAxisTimelineProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNavigateToChapter?: (id: string) => void;
  onSelectEvent?: (id: string) => void;
}

const RULER_HEIGHT = 26;
const ROW_HEIGHT = 46;
const ROW_GAP = 30;
const PADDING = 16;

function clipTopForAxis(axisIndex: number, clip: TimelineClip): number {
  const base = RULER_HEIGHT + axisIndex * (ROW_HEIGHT + ROW_GAP);
  return base + (clip.lane ?? 0) * 16;
}

const DualAxisTimeline: React.FC<DualAxisTimelineProps> = ({ project, onUpdate, onNavigateToChapter, onSelectEvent }) => {
  const { t } = useTranslation('timeline');
  const sequence = useGenericModelStore((state) => state.sequence);
  const [zoom, setZoom] = useState(96);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [majorOnly, setMajorOnly] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [issues, setIssues] = useState<TimelineIssue[] | null>(null);
  const [drag, setDrag] = useState<{ clipId: string; delta: number } | null>(null);
  const dragStart = useRef<{ x: number; fromClipId: string; start: number } | null>(null);

  useEffect(() => {
    void useGenericModelStore.getState().load(project.id);
  }, [project.id]);

  const model: TimelineModel = useMemo(() => buildTimelineModel(project, sequence), [project, sequence]);
  const clipIndex = useMemo(() => {
    const map = new Map<string, { clip: TimelineClip; axisIndex: number }>();
    model.axes.forEach((axis, axisIndex) => axis.clips.forEach((clip) => map.set(clip.id, { clip, axisIndex })));
    return map;
  }, [model]);

  const filterClips = (clips: TimelineClip[]): TimelineClip[] => (majorOnly ? clips.filter((clip) => clip.importance === 'major') : clips);
  const span = Math.max(model.maxEnd, 1);
  const contentWidth = PADDING * 2 + span * zoom;
  const contentHeight = RULER_HEIGHT + model.axes.length * (ROW_HEIGHT + ROW_GAP);
  const ticks = Array.from({ length: Math.ceil(span) + 1 }, (_, index) => index);

  const chaptersById = useMemo(() => new Map((project.chapters ?? []).map((chapter) => [chapter.id, chapter])), [project.chapters]);
  const markers = project.timelineMarkers ?? [];

  const addMarker = () => {
    const label = t('dual.markerLabel', { n: markers.length + 1 });
    onUpdate({
      timelineMarkers: [...markers, { id: `marker:${crypto.randomUUID()}`, label, axis: 'narrative', position: Math.round(playhead) }],
    });
  };

  const removeMarker = (id: string) => {
    onUpdate({ timelineMarkers: markers.filter((marker) => marker.id !== id) });
  };

  const finishDrag = (delta: number) => {
    if (!dragStart.current) return;
    const fromClipId = dragStart.current.fromClipId;
    const chapterId = fromClipId.replace('chapter:', '');
    const ordered = [...(project.chapters ?? [])].sort((a, b) => a.order - b.order);
    const fromIndex = ordered.findIndex((chapter) => chapter.id === chapterId);
    const candidates = ordered.map((_, index) => index);
    const rawTarget = dragStart.current.start + delta;
    const target = snapEnabled ? snapTo(rawTarget, candidates, 0.4) : rawTarget;
    const toIndex = Math.max(0, Math.min(ordered.length - 1, Math.round(target)));
    if (fromIndex >= 0 && fromIndex !== toIndex) {
      const next = [...ordered];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return;
      next.splice(toIndex, 0, moved);
      onUpdate({ chapters: next.map((chapter, index) => ({ ...chapter, order: index })) });
    }
    dragStart.current = null;
    setDrag(null);
  };

  const mergeSelected = async () => {
    const chapterIds = selected.map((id) => id.replace('chapter:', '')).filter((id) => chaptersById.has(id));
    if (chapterIds.length < 2) return;
    const groupId = `group:${crypto.randomUUID()}`;
    const orderIndex = Math.min(...chapterIds.map((id) => chaptersById.get(id)?.order ?? 0));
    const next = sequence.map((item) => ({ ...item }));
    next.push({ id: `seq:${groupId}`, workId: project.id, nodeId: groupId, parentId: null, orderIndex });
    for (const chapterId of chapterIds) {
      const existing = next.find((item) => item.nodeId === chapterId);
      if (existing) existing.parentId = groupId;
      else next.push({ id: `seq:${chapterId}`, workId: project.id, nodeId: chapterId, parentId: groupId, orderIndex: chaptersById.get(chapterId)?.order ?? 0 });
    }
    await useGenericModelStore.getState().saveSequence(next);
    setSelected([]);
  };

  const unmergeSelected = async () => {
    const groupIds = new Set(selected.map((id) => clipIndex.get(id)?.clip.groupId).filter((value): value is string => !!value));
    if (groupIds.size === 0) return;
    const next = sequence
      .filter((item) => !groupIds.has(item.nodeId))
      .map((item) => (item.parentId && groupIds.has(item.parentId) ? { ...item, parentId: null } : { ...item }));
    await useGenericModelStore.getState().saveSequence(next);
    setSelected([]);
  };

  const toggleSelect = (clipId: string) => {
    setSelected((prev) => (prev.includes(clipId) ? prev.filter((id) => id !== clipId) : [...prev, clipId]));
  };

  const axisLabel = (id: TimelineAxisId): string => (id === 'narrative' ? t('dual.axis.narrative') : t('dual.axis.story'));

  const issueText = (issue: TimelineIssue): string => {
    switch (issue.code) {
      case 'characterLocationConflict':
        return t('dual.issue.characterLocationConflict', { character: issue.values.character, places: issue.values.places });
      case 'bornAfterAppearance':
        return t('dual.issue.bornAfterAppearance', { character: issue.values.character, year: issue.values.year, event: issue.values.event });
      case 'foreshadowOrder':
        return t('dual.issue.foreshadowOrder', { title: issue.values.title });
      case 'missingEventLink':
        return t('dual.issue.missingEventLink', { chapter: issue.values.chapter });
      default:
        return issue.code;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">{t('dual.title')}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setZoom((value) => Math.max(48, value - 24))} aria-label={t('dual.zoomOut')}>
            <ZoomOut className="size-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((value) => Math.min(240, value + 24))} aria-label={t('dual.zoomIn')}>
            <ZoomIn className="size-3.5" />
          </Button>
          <Button size="sm" variant={snapEnabled ? 'default' : 'outline'} onClick={() => setSnapEnabled((value) => !value)}>
            {t('dual.snap')}
          </Button>
          <Button size="sm" variant={majorOnly ? 'default' : 'outline'} onClick={() => setMajorOnly((value) => !value)}>
            {t('dual.majorOnly')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIssues(checkTimelineConsistency(project))}>
            <Search className="size-3.5" />
            {t('dual.check')}
          </Button>
          <Button size="sm" variant="outline" onClick={addMarker}>
            <Flag className="size-3.5" />
            {t('dual.addMarker')}
          </Button>
          <Button size="sm" variant="outline" disabled={selected.length < 2} onClick={() => void mergeSelected()}>
            <GitMerge className="size-3.5" />
            {t('dual.merge')}
          </Button>
          <Button size="sm" variant="outline" disabled={selected.length === 0} onClick={() => void unmergeSelected()}>
            <Undo2 className="size-3.5" />
            {t('dual.unmerge')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {model.axes.every((axis) => axis.clips.length === 0) ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('dual.empty')}</p>
        ) : (
          <div className="overflow-auto rounded-lg border border-border bg-card"
            onWheel={(event) => {
              if (!event.altKey) return;
              setZoom((value) => Math.max(48, Math.min(240, value - event.deltaY * 0.5)));
            }}
          >
            <div className="relative" style={{ width: contentWidth, height: contentHeight }}>
              <div
                className="absolute top-0 z-10 h-full w-px bg-primary"
                style={{ left: PADDING + playhead * zoom }}
                aria-hidden
              />
              <div className="absolute inset-x-0 top-0 h-6 cursor-ew-resize border-b border-border" style={{ width: contentWidth }}
                onPointerMove={(event) => {
                  if (event.buttons !== 1) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setPlayhead(Math.max(0, (event.clientX - rect.left - PADDING) / zoom));
                }}
              >
                {ticks.map((tick) => (
                  <span key={tick} className="absolute top-1 text-2xs text-muted-foreground" style={{ left: PADDING + tick * zoom }}>
                    {tick}
                  </span>
                ))}
                {markers.map((marker) => (
                  <span
                    key={marker.id}
                    title={marker.label}
                    className="absolute top-0 z-20 cursor-pointer text-primary"
                    style={{ left: PADDING + marker.position * zoom }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPlayhead(marker.position);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      removeMarker(marker.id);
                    }}
                  >
                    <Flag className="size-3.5 fill-current" />
                  </span>
                ))}
              </div>

              <svg className="pointer-events-none absolute inset-0" width={contentWidth} height={contentHeight}>
                {model.links.map((link) => {
                  const from = clipIndex.get(link.fromClipId);
                  const to = clipIndex.get(link.toClipId);
                  if (!from || !to) return null;
                  const x1 = PADDING + from.clip.start * zoom + (from.clip.duration * zoom) / 2;
                  const y1 = clipTopForAxis(from.axisIndex, from.clip) + ROW_HEIGHT;
                  const x2 = PADDING + to.clip.start * zoom + (to.clip.duration * zoom) / 2;
                  const y2 = clipTopForAxis(to.axisIndex, to.clip);
                  return <path key={`${link.fromClipId}-${link.toClipId}`} d={`M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`} fill="none" stroke="var(--color-border)" strokeDasharray="4 4" />;
                })}
              </svg>

              {model.axes.map((axis, axisIndex) => (
                <div key={axis.id}>
                  <span className="absolute text-2xs font-medium text-muted-foreground" style={{ left: 4, top: RULER_HEIGHT + axisIndex * (ROW_HEIGHT + ROW_GAP) + 4 }}>
                    {axisLabel(axis.id)}
                  </span>
                  {filterClips(axis.clips).map((clip) => {
                    const selectedClip = selected.includes(clip.id);
                    const isDragging = drag?.clipId === clip.id;
                    const offset = isDragging ? drag.delta : 0;
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        className={cn(
                          'absolute overflow-hidden rounded-md border px-2 text-left text-2xs transition-colors',
                          clip.importance === 'major' ? 'border-primary/50 bg-primary/10' : 'border-border bg-muted',
                          selectedClip && 'ring-2 ring-primary',
                          axis.id === 'narrative' && 'cursor-grab',
                        )}
                        style={{
                          left: PADDING + (clip.start + offset) * zoom,
                          top: clipTopForAxis(axisIndex, clip),
                          width: Math.max(28, clip.duration * zoom - 6),
                          height: ROW_HEIGHT,
                        }}
                        onClick={() => toggleSelect(clip.id)}
                        onDoubleClick={() => (clip.kind === 'chapter' ? onNavigateToChapter?.(clip.entityId) : onSelectEvent?.(clip.entityId))}
                        onPointerDown={(event) => {
                          if (axis.id !== 'narrative') return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          dragStart.current = { x: event.clientX, fromClipId: clip.id, start: clip.start };
                          setDrag({ clipId: clip.id, delta: 0 });
                        }}
                        onPointerMove={(event) => {
                          if (!dragStart.current || dragStart.current.fromClipId !== clip.id) return;
                          setDrag({ clipId: clip.id, delta: (event.clientX - dragStart.current.x) / zoom });
                        }}
                        onPointerUp={() => {
                          if (dragStart.current?.fromClipId === clip.id) finishDrag(drag?.delta ?? 0);
                        }}
                      >
                        <span className="block truncate font-medium">{clip.label}</span>
                        {clip.groupId && <span className="block truncate text-muted-foreground">{t('dual.grouped')}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {issues && (
          <div className="space-y-1">
            {issues.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="size-3.5 text-primary" />
                {t('dual.noIssues')}
              </p>
            ) : (
              issues.map((issue, index) => (
                <p key={`${issue.code}-${issue.targetId ?? index}`} className={cn('flex items-start gap-1.5 text-xs', issue.severity === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {issueText(issue)}
                </p>
              ))
            )}
          </div>
        )}
        {markers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {markers.map((marker) => (
              <span key={marker.id} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground">
                <button type="button" onClick={() => setPlayhead(marker.position)}>{marker.label}</button>
                <button type="button" aria-label={t('dual.removeMarker')} onClick={() => removeMarker(marker.id)}>×</button>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DualAxisTimeline;
