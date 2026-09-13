/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 双轴时间线模型：叙事轴按轨道与时长排布章节，故事时间轴按事件日期。 */
import type { Chapter, HistoryDate, Project } from '@shared/types';

import type { SequenceItem } from '@/app/stores/genericModelStore';

export type TimelineAxisId = 'narrative' | 'story';

export interface TimelineTrack {
  id: string;
  label: string;
}

export interface TimelineClip {
  /** `chapter:<id>` 或 `event:<id>`，保证全局唯一。 */
  id: string;
  kind: 'chapter' | 'event';
  entityId: string;
  label: string;
  /** 轴内起始刻度（叙事轴为累计时长，故事轴为日期序数）。 */
  start: number;
  duration: number;
  importance: 'major' | 'minor';
  /** 合并分组的组节点 id；未分组为 undefined。 */
  groupId?: string;
  /** 同一刻度的堆叠层，避免重叠（故事轴用）。 */
  lane?: number;
  /** 叙事轴所属轨道；事件为 undefined。 */
  trackId?: string;
  /** 张力关键帧（0..1）；未设为 undefined。 */
  tension?: number;
}

export interface TimelineLink {
  fromClipId: string;
  toClipId: string;
  label: 'depicts';
}

export interface TimelineAxis {
  id: TimelineAxisId;
  clips: TimelineClip[];
}

export interface TimelineModel {
  axes: TimelineAxis[];
  links: TimelineLink[];
  tracks: TimelineTrack[];
  minStart: number;
  maxEnd: number;
}

/** 最小片段时长，避免拖到 0。 */
export const MIN_CLIP_DURATION = 0.25;

/** 历史日期转可比较序数：以「月」为刻度，年内按天做小数偏移。 */
export function dateToOrdinal(date: HistoryDate | undefined): number | null {
  if (!date) return null;
  const month = date.month ?? 1;
  const day = date.day ?? 1;
  return date.year * 12 + (month - 1) + (day - 1) / 31;
}

/** 吸附：在 threshold 内贴近最近的候选刻度，否则返回原值。 */
export function snapTo(value: number, candidates: number[], threshold: number): number {
  let best = value;
  let bestDistance = threshold;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** 在分数位置拆分正文：优先在换行处断，其次按字符位置。 */
export function splitContentAtFraction(content: string, fraction: number): { before: string; after: string } {
  const clamped = Math.max(0.05, Math.min(0.95, fraction));
  const target = Math.round(content.length * clamped);
  const nextBreak = content.indexOf('\n', target);
  const prevBreak = content.lastIndexOf('\n', target);
  let cut = target;
  if (nextBreak !== -1 && nextBreak - target <= 40) cut = nextBreak + 1;
  else if (prevBreak > 0) cut = prevBreak + 1;
  return { before: content.slice(0, cut), after: content.slice(cut) };
}

/** 把章节拆成两章（保留 id/order，新章接力）。 */
export function splitChapter(chapter: Chapter, fraction: number, newId: string): [Chapter, Chapter] {
  const { before, after } = splitContentAtFraction(chapter.content, fraction);
  return [
    { ...chapter, content: before, duration: (chapter.duration ?? 1) * Math.max(0.05, Math.min(0.95, fraction)) },
    { ...chapter, id: newId, title: `${chapter.title}（续）`, content: after, order: chapter.order + 1 },
  ];
}

/** 把某章移动到目标轨道与目标位置，重排全局 order（轨道序 → 轨内序）。 */
export function reorderChapters(
  chapters: Chapter[],
  tracks: TimelineTrack[],
  chapterId: string,
  targetTrackId: string,
  targetIndex: number,
): Chapter[] {
  const validTrackIds = new Set(tracks.map((track) => track.id));
  const fallbackTrack = tracks[0]?.id ?? 'main';
  const byTrack = new Map<string, Chapter[]>();
  for (const chapter of chapters) {
    const trackId = chapter.trackId && validTrackIds.has(chapter.trackId) ? chapter.trackId : fallbackTrack;
    const list = byTrack.get(trackId);
    if (list) list.push(chapter);
    else byTrack.set(trackId, [chapter]);
  }
  const targetTrack = validTrackIds.has(targetTrackId) ? targetTrackId : fallbackTrack;
  const moving = chapters.find((chapter) => chapter.id === chapterId);
  if (!moving) return chapters;
  for (const [trackId, list] of byTrack) {
    byTrack.set(trackId, list.filter((chapter) => chapter.id !== chapterId));
  }
  const targetList = byTrack.get(targetTrack) ?? [];
  const index = Math.max(0, Math.min(targetList.length, targetIndex));
  targetList.splice(index, 0, { ...moving, trackId: targetTrack });
  byTrack.set(targetTrack, targetList);

  const flattened: Chapter[] = [];
  for (const track of tracks) flattened.push(...(byTrack.get(track.id) ?? []));
  for (const [trackId, list] of byTrack) if (!validTrackIds.has(trackId)) flattened.push(...list);
  return flattened.map((chapter, order) => ({ ...chapter, order }));
}

export function buildTimelineModel(project: Project, sequence: SequenceItem[] = []): TimelineModel {
  const parentOf = new Map<string, string>();
  for (const item of sequence) {
    if (item.parentId) parentOf.set(item.nodeId, item.parentId);
  }

  const tracks: TimelineTrack[] = project.timelineTracks?.length ? project.timelineTracks : [{ id: 'main', label: '主轨' }];
  const trackIds = new Set(tracks.map((track) => track.id));

  const chapters = [...(project.chapters ?? [])].sort((a, b) => a.order - b.order);
  const cursorByTrack = new Map<string, number>();
  const narrativeClips: TimelineClip[] = chapters.map((chapter) => {
    const trackId = chapter.trackId && trackIds.has(chapter.trackId) ? chapter.trackId : tracks[0]?.id ?? 'main';
    const start = cursorByTrack.get(trackId) ?? 0;
    const duration = Math.max(MIN_CLIP_DURATION, chapter.duration ?? 1);
    cursorByTrack.set(trackId, start + duration);
    return {
      id: `chapter:${chapter.id}`,
      kind: 'chapter',
      entityId: chapter.id,
      label: chapter.title,
      start,
      duration,
      importance: chapter.status === 'done' ? 'major' : 'minor',
      groupId: parentOf.get(chapter.id),
      trackId,
      tension: chapter.tension,
    };
  });

  const events = project.timeline?.events ?? [];
  const datedEvents = events
    .map((event) => ({ event, ordinal: dateToOrdinal(event.date) }))
    .filter((entry): entry is { event: (typeof events)[number]; ordinal: number } => entry.ordinal !== null)
    .sort((a, b) => a.ordinal - b.ordinal);

  const minOrdinal = datedEvents[0]?.ordinal ?? 0;
  const laneCount = new Map<number, number>();
  const storyClips: TimelineClip[] = datedEvents.map(({ event, ordinal }) => {
    const lane = laneCount.get(ordinal) ?? 0;
    laneCount.set(ordinal, lane + 1);
    return {
      id: `event:${event.id}`,
      kind: 'event',
      entityId: event.id,
      label: event.title,
      start: ordinal - minOrdinal,
      duration: 1,
      importance: event.significance ?? 'minor',
      lane,
    };
  });

  const eventIds = new Set(events.map((event) => event.id));
  const links: TimelineLink[] = [];
  for (const chapter of chapters) {
    if (chapter.timelineEventId && eventIds.has(chapter.timelineEventId)) {
      links.push({ fromClipId: `chapter:${chapter.id}`, toClipId: `event:${chapter.timelineEventId}`, label: 'depicts' });
    }
  }

  const narrativeMax = narrativeClips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
  const storyMax = storyClips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);

  return {
    axes: [
      { id: 'narrative', clips: narrativeClips },
      { id: 'story', clips: storyClips },
    ],
    links,
    tracks,
    minStart: 0,
    maxEnd: Math.max(narrativeMax, storyMax),
  };
}
