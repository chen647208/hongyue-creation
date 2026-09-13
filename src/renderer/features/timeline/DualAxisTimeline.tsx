/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 双轴时间线：张力曲线、多轨叙事、故事时间；可拖拽/裁剪/换轨/拆分/标记/吸附/缩放。 */
import type { Project } from '@shared/types';
import { AlertTriangle, Check, Flag, GitMerge, Plus, Scissors, Search, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/Card';
import { cn } from '@/shared/utils/cn';

import { checkTimelineConsistency, type TimelineIssue } from './timelineConsistency';
import { buildTimelineModel, MIN_CLIP_DURATION, reorderChapters, snapTo, splitChapter, type TimelineClip } from './timelineModel';

interface DualAxisTimelineProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNavigateToChapter?: (id: string) => void;
  onSelectEvent?: (id: string) => void;
}

const RULER_HEIGHT = 26;
const TENSION_HEIGHT = 90;
const TRACK_HEIGHT = 46;
const TRACK_GAP = 18;
const PADDING = 16;
const TENSION_TOP = RULER_HEIGHT;
const TRACKS_TOP = RULER_HEIGHT + TENSION_HEIGHT + TRACK_GAP;

type DragMode = 'move' | 'resize' | 'tension';

interface DragState {
  mode: DragMode;
  clipId: string;
  /** 拖拽结果值：move=目标起始刻度，resize=时长，tension=张力 0..1。 */
  value: number;
  targetTrackId?: string;
}

const DualAxisTimeline: React.FC<DualAxisTimelineProps> = ({ project, onUpdate, onNavigateToChapter, onSelectEvent }) => {
  const { t } = useTranslation('timeline');
  const [zoom, setZoom] = useState(96);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [majorOnly, setMajorOnly] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [issues, setIssues] = useState<TimelineIssue[] | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [viewport, setViewport] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef<{ clipId: string; mode: DragMode; base: number } | null>(null);

  // 视口裁剪：只渲染可见范围内的片段，长书滚动不退化。
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => setViewport({ left: element.scrollLeft, width: element.clientWidth });
    update();
    element.addEventListener('scroll', update);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  const model = useMemo(() => buildTimelineModel(project), [project]);
  const narrativeClips = useMemo(() => model.axes.find((axis) => axis.id === 'narrative')?.clips ?? [], [model]);
  const storyClips = useMemo(() => model.axes.find((axis) => axis.id === 'story')?.clips ?? [], [model]);
  const chaptersById = useMemo(() => new Map((project.chapters ?? []).map((chapter) => [chapter.id, chapter])), [project.chapters]);
  const markers = project.timelineMarkers ?? [];

  const clipIndex = useMemo(() => {
    const map = new Map<string, { clip: TimelineClip; axis: 'narrative' | 'story' }>();
    narrativeClips.forEach((clip) => map.set(clip.id, { clip, axis: 'narrative' }));
    storyClips.forEach((clip) => map.set(clip.id, { clip, axis: 'story' }));
    return map;
  }, [narrativeClips, storyClips]);

  const trackTops = useMemo(() => {
    const tops: Record<string, number> = {};
    let y = TRACKS_TOP;
    for (const track of model.tracks) {
      tops[track.id] = y;
      y += TRACK_HEIGHT + TRACK_GAP;
    }
    return tops;
  }, [model.tracks]);
  const storyTop = TRACKS_TOP + model.tracks.length * (TRACK_HEIGHT + TRACK_GAP);

  const span = Math.max(model.maxEnd, 1);
  const contentWidth = PADDING * 2 + span * zoom;
  const contentHeight = storyTop + TRACK_HEIGHT + PADDING;
  const ticks = Array.from({ length: Math.ceil(span) + 1 }, (_, index) => index);

  const clipY = (clip: TimelineClip): number =>
    clip.kind === 'event' ? storyTop + (clip.lane ?? 0) * 16 : (trackTops[clip.trackId ?? model.tracks[0]?.id ?? 'main'] ?? storyTop);

  const pointFromEvent = (event: React.PointerEvent): { x: number; y: number } => {
    const scroll = scrollRef.current;
    if (!scroll) return { x: PADDING, y: 0 };
    const rect = scroll.getBoundingClientRect();
    return { x: event.clientX - rect.left + scroll.scrollLeft, y: event.clientY - rect.top + scroll.scrollTop };
  };
  const unitFromEvent = (event: React.PointerEvent): number => (pointFromEvent(event).x - PADDING) / zoom;

  const nearestTrack = (y: number): string => {
    let bestId = model.tracks[0]?.id ?? 'main';
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const track of model.tracks) {
      const top = trackTops[track.id] ?? storyTop;
      const distance = Math.abs(y - (top + TRACK_HEIGHT / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = track.id;
      }
    }
    return bestId;
  };

  const finishDrag = (state: DragState): void => {
    const chapterId = state.clipId.replace('chapter:', '');
    const chapter = chaptersById.get(chapterId);
    if (!chapter) {
      dragOrigin.current = null;
      setDrag(null);
      return;
    }
    if (state.mode === 'resize') {
      onUpdate({ chapters: project.chapters.map((c) => (c.id === chapterId ? { ...c, duration: Math.max(MIN_CLIP_DURATION, state.value) } : c)) });
    } else if (state.mode === 'tension') {
      onUpdate({ chapters: project.chapters.map((c) => (c.id === chapterId ? { ...c, tension: state.value } : c)) });
    } else {
      const targetTrackId = state.targetTrackId ?? chapter.trackId ?? model.tracks[0]?.id ?? 'main';
      const list = narrativeClips.filter((clip) => (clip.trackId ?? 'main') === targetTrackId && clip.entityId !== chapterId).sort((a, b) => a.start - b.start);
      const targetIndex = list.filter((clip) => clip.start + clip.duration / 2 < state.value).length;
      onUpdate({ chapters: reorderChapters(project.chapters, model.tracks, chapterId, targetTrackId, targetIndex) });
    }
    dragOrigin.current = null;
    setDrag(null);
  };

  const mergeSelected = () => {
    const chapterIds = selected.map((id) => id.replace('chapter:', '')).filter((id) => chaptersById.has(id));
    if (chapterIds.length < 2) return;
    const groupId = `group:${crypto.randomUUID()}`;
    onUpdate({ chapters: project.chapters.map((chapter) => (chapterIds.includes(chapter.id) ? { ...chapter, groupId } : chapter)) });
    setSelected([]);
  };

  const unmergeSelected = () => {
    const chapterIds = selected.map((id) => id.replace('chapter:', '')).filter((id) => chaptersById.get(id)?.groupId);
    if (chapterIds.length === 0) return;
    onUpdate({ chapters: project.chapters.map((chapter) => (chapterIds.includes(chapter.id) ? { ...chapter, groupId: undefined } : chapter)) });
    setSelected([]);
  };

  const addTrack = () => {
    const id = `track:${crypto.randomUUID()}`;
    onUpdate({ timelineTracks: [...model.tracks, { id, label: t('dual.trackLabel', { n: model.tracks.length + 1 }) }] });
  };

  const removeTrack = (trackId: string) => {
    if (model.tracks.length <= 1) return;
    const fallback = model.tracks.find((track) => track.id !== trackId)?.id ?? 'main';
    onUpdate({
      timelineTracks: model.tracks.filter((track) => track.id !== trackId),
      chapters: project.chapters.map((chapter) => (chapter.trackId === trackId ? { ...chapter, trackId: fallback } : chapter)),
    });
  };

  const addMarker = () => {
    onUpdate({
      timelineMarkers: [...markers, { id: `marker:${crypto.randomUUID()}`, label: t('dual.markerLabel', { n: markers.length + 1 }), axis: 'narrative', position: playhead }],
    });
  };

  const removeMarker = (id: string) => {
    onUpdate({ timelineMarkers: markers.filter((marker) => marker.id !== id) });
  };

  const splitAtPlayhead = () => {
    const target = narrativeClips.find((clip) => playhead >= clip.start && playhead < clip.start + clip.duration);
    if (!target) return;
    const chapter = chaptersById.get(target.entityId);
    if (!chapter) return;
    const fraction = (playhead - target.start) / target.duration;
    const [left, right] = splitChapter(chapter, fraction, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);
    const next = project.chapters.flatMap((c) => (c.id === chapter.id ? [left, right] : [c])).map((c, order) => ({ ...c, order }));
    onUpdate({ chapters: next });
  };

  const toggleSelect = (clipId: string) => {
    setSelected((prev) => (prev.includes(clipId) ? prev.filter((id) => id !== clipId) : [...prev, clipId]));
  };

  const axisLabel = (id: 'narrative' | 'story'): string => (id === 'narrative' ? t('dual.axis.narrative') : t('dual.axis.story'));

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

  const visibleNarrative = (clips: TimelineClip[]): TimelineClip[] => (majorOnly ? clips.filter((clip) => clip.importance === 'major') : clips);

  const marginUnits = (viewport.width || span * zoom) / zoom;
  const visibleStart = (viewport.left - PADDING) / zoom - 4;
  const visibleEnd = (viewport.left - PADDING) / zoom + marginUnits + 4;
  const inView = (clip: TimelineClip): boolean => clip.start + clip.duration >= visibleStart && clip.start <= visibleEnd;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">{t('dual.title')}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setZoom((value) => Math.max(48, value - 24))} aria-label={t('dual.zoomOut')}><ZoomOut className="size-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((value) => Math.min(240, value + 24))} aria-label={t('dual.zoomIn')}><ZoomIn className="size-3.5" /></Button>
          <Button size="sm" variant={snapEnabled ? 'default' : 'outline'} onClick={() => setSnapEnabled((value) => !value)}>{t('dual.snap')}</Button>
          <Button size="sm" variant={majorOnly ? 'default' : 'outline'} onClick={() => setMajorOnly((value) => !value)}>{t('dual.majorOnly')}</Button>
          <Button size="sm" variant="outline" onClick={() => setIssues(checkTimelineConsistency(project))}><Search className="size-3.5" />{t('dual.check')}</Button>
          <Button size="sm" variant="outline" disabled={!narrativeClips.some((clip) => playhead >= clip.start && playhead < clip.start + clip.duration)} onClick={splitAtPlayhead}>
            <Scissors className="size-3.5" />{t('dual.split')}
          </Button>
          <Button size="sm" variant="outline" disabled={selected.length < 2} onClick={() => void mergeSelected()}><GitMerge className="size-3.5" />{t('dual.merge')}</Button>
          <Button size="sm" variant="outline" disabled={selected.length === 0} onClick={() => void unmergeSelected()}><Undo2 className="size-3.5" />{t('dual.unmerge')}</Button>
          <Button size="sm" variant="outline" onClick={addMarker}><Flag className="size-3.5" />{t('dual.addMarker')}</Button>
          <Button size="sm" variant="outline" onClick={addTrack}><Plus className="size-3.5" />{t('dual.addTrack')}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {narrativeClips.length === 0 && storyClips.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('dual.empty')}</p>
        ) : (
          <div
            ref={scrollRef}
            className="overflow-auto rounded-lg border border-border bg-card"
            onWheel={(event) => {
              if (!event.altKey) return;
              setZoom((value) => Math.max(48, Math.min(240, value - event.deltaY * 0.5)));
            }}
          >
            <div className="relative" style={{ width: contentWidth, height: contentHeight }}>
              <div className="absolute top-0 z-10 h-full w-px bg-primary" style={{ left: PADDING + playhead * zoom }} aria-hidden />
              <div
                className="absolute inset-x-0 top-0 h-6 cursor-ew-resize border-b border-border"
                style={{ width: contentWidth }}
                onPointerMove={(event) => {
                  if (event.buttons !== 1) return;
                  setPlayhead(Math.max(0, unitFromEvent(event)));
                }}
              >
                {ticks.map((tick) => (
                  <span key={tick} className="absolute top-1 text-2xs text-muted-foreground" style={{ left: PADDING + tick * zoom }}>{tick}</span>
                ))}
                {markers.map((marker) => (
                  <span
                    key={marker.id}
                    title={marker.label}
                    className="absolute top-0 z-20 cursor-pointer text-primary"
                    style={{ left: PADDING + marker.position * zoom }}
                    onClick={(event) => { event.stopPropagation(); setPlayhead(marker.position); }}
                    onDoubleClick={(event) => { event.stopPropagation(); removeMarker(marker.id); }}
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
                  const y1 = clipY(from.clip) + TRACK_HEIGHT;
                  const x2 = PADDING + to.clip.start * zoom + (to.clip.duration * zoom) / 2;
                  const y2 = clipY(to.clip);
                  return <path key={`${link.fromClipId}-${link.toClipId}`} d={`M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`} fill="none" stroke="var(--color-border)" strokeDasharray="4 4" />;
                })}
                {storyClips.length > 0 && (
                  <text x={4} y={storyTop + 12} className="text-2xs" fill="var(--color-muted-foreground)">{axisLabel('story')}</text>
                )}
              </svg>

              <div className="absolute inset-x-0" style={{ top: TENSION_TOP, height: TENSION_HEIGHT }}>
                <svg width={contentWidth} height={TENSION_HEIGHT}>
                  {(() => {
                    const points = visibleNarrative(narrativeClips)
                      .filter((clip) => clip.tension !== undefined && inView(clip))
                      .sort((a, b) => a.start - b.start);
                    if (points.length < 1) return null;
                    const coords = points.map((clip) => ({
                      x: PADDING + clip.start * zoom + (clip.duration * zoom) / 2,
                      y: (1 - (clip.tension ?? 0)) * (TENSION_HEIGHT - 16) + 8,
                    }));
                    return (
                      <>
                        <polyline points={coords.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="var(--color-chart-2)" strokeWidth={1.5} />
                        {points.map((clip, index) => (
                          <circle
                            key={clip.id}
                            cx={coords[index]?.x}
                            cy={coords[index]?.y}
                            r={drag?.clipId === clip.id && drag.mode === 'tension' ? 7 : 5}
                            fill="var(--color-chart-2)"
                            className="cursor-ns-resize"
                            style={{ pointerEvents: 'auto' }}
                            onPointerDown={(event) => {
                              event.currentTarget.setPointerCapture(event.pointerId);
                              dragOrigin.current = { clipId: clip.id, mode: 'tension', base: clip.tension ?? 0 };
                              setDrag({ mode: 'tension', clipId: clip.id, value: clip.tension ?? 0 });
                            }}
                            onPointerMove={(event) => {
                              if (dragOrigin.current?.clipId !== clip.id || dragOrigin.current.mode !== 'tension') return;
                              const canvasY = pointFromEvent(event).y;
                              const value = Math.max(0, Math.min(1, 1 - (canvasY - TENSION_TOP - 8) / (TENSION_HEIGHT - 16)));
                              setDrag({ mode: 'tension', clipId: clip.id, value });
                            }}
                            onPointerUp={() => { if (drag) finishDrag(drag); }}
                          />
                        ))}
                      </>
                    );
                  })()}
                </svg>
                <span className="absolute left-1 top-1 text-2xs text-muted-foreground">{t('dual.tension')}</span>
              </div>

              {model.tracks.map((track) => (
                <div key={track.id}>
                  <span className="absolute text-2xs font-medium text-muted-foreground" style={{ left: 4, top: (trackTops[track.id] ?? storyTop) + 4 }}>{track.label}</span>
                  {model.tracks.length > 1 && (
                    <button
                      type="button"
                      aria-label={t('dual.removeTrack')}
                      className="absolute text-muted-foreground hover:text-destructive"
                      style={{ left: 4, top: (trackTops[track.id] ?? storyTop) + 22 }}
                      onClick={() => removeTrack(track.id)}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                  {visibleNarrative(narrativeClips).filter((clip) => (clip.trackId ?? 'main') === track.id && inView(clip)).map((clip) => {
                    const selectedClip = selected.includes(clip.id);
                    const active = drag?.clipId === clip.id;
                    const offset = active && drag.mode === 'move' ? drag.value - clip.start : 0;
                    return (
                      <div
                        key={clip.id}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'absolute cursor-grab overflow-hidden rounded-md border px-2 text-left text-2xs transition-colors',
                          clip.importance === 'major' ? 'border-primary/50 bg-primary/10' : 'border-border bg-muted',
                          selectedClip && 'ring-2 ring-primary',
                        )}
                        style={{ left: PADDING + (clip.start + offset) * zoom, top: trackTops[track.id] ?? storyTop, width: Math.max(28, clip.duration * zoom - 4), height: TRACK_HEIGHT }}
                        onClick={() => toggleSelect(clip.id)}
                        onDoubleClick={() => onNavigateToChapter?.(clip.entityId)}
                        onPointerDown={(event) => {
                          event.currentTarget.setPointerCapture(event.pointerId);
                          dragOrigin.current = { clipId: clip.id, mode: 'move', base: clip.start };
                          setDrag({ mode: 'move', clipId: clip.id, value: clip.start, targetTrackId: clip.trackId });
                        }}
                        onPointerMove={(event) => {
                          const origin = dragOrigin.current;
                          if (!origin || origin.clipId !== clip.id || origin.mode !== 'move') return;
                          const point = pointFromEvent(event);
                          const raw = (point.x - PADDING) / zoom;
                          const candidates = narrativeClips.map((other) => other.start);
                          const target = snapEnabled ? snapTo(raw, candidates, 0.3) : raw;
                          setDrag({ mode: 'move', clipId: clip.id, value: target, targetTrackId: nearestTrack(point.y) });
                        }}
                        onPointerUp={() => { if (drag) finishDrag(drag); }}
                      >
                        <span className="block truncate font-medium">{clip.label}</span>
                        {clip.groupId && <span className="block truncate text-muted-foreground">{t('dual.grouped')}</span>}
                        <span
                          role="separator"
                          aria-label={t('dual.resize')}
                          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-primary/20"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            dragOrigin.current = { clipId: clip.id, mode: 'resize', base: clip.duration };
                            setDrag({ mode: 'resize', clipId: clip.id, value: clip.duration });
                          }}
                          onPointerMove={(event) => {
                            if (dragOrigin.current?.clipId !== clip.id || dragOrigin.current.mode !== 'resize') return;
                            const value = Math.max(MIN_CLIP_DURATION, dragOrigin.current.base + (pointFromEvent(event).x - PADDING) / zoom - clip.start);
                            setDrag({ mode: 'resize', clipId: clip.id, value });
                          }}
                          onPointerUp={(event) => {
                            event.stopPropagation();
                            if (drag) finishDrag(drag);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}

              {storyClips.filter(inView).map((clip) => (
                <button
                  key={clip.id}
                  type="button"
                  className={cn('absolute overflow-hidden rounded-md border px-2 text-left text-2xs', clip.importance === 'major' ? 'border-primary/50 bg-primary/10' : 'border-border bg-muted')}
                  style={{ left: PADDING + clip.start * zoom, top: clipY(clip), width: Math.max(28, clip.duration * zoom - 6), height: TRACK_HEIGHT }}
                  onDoubleClick={() => onSelectEvent?.(clip.entityId)}
                >
                  <span className="block truncate font-medium">{clip.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {issues && (
          <div className="space-y-1">
            {issues.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5 text-primary" />{t('dual.noIssues')}</p>
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
