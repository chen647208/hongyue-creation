/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 草稿矩阵：以「轨道 × 片段」承载非线性摆弄，与成稿轨道共享同一份 chapters。
 * 矩阵是 chapters 的投影，提交即写回 order/trackId，不产生第二份真相。
 */
import type { Chapter, Project } from '@shared/types';

import type { TimelineTrack } from './timelineModel';

export interface DraftMatrixLane {
  trackId: string;
  /** 轨内片段 id，顺序即轨内次序。 */
  clipIds: string[];
}

export interface DraftMatrix {
  tracks: TimelineTrack[];
  lanes: DraftMatrixLane[];
}

function resolveTracks(project: Project): TimelineTrack[] {
  return project.timelineTracks?.length ? project.timelineTracks : [{ id: 'main', label: '主轨' }];
}

/** 从 chapters 投影矩阵：与成稿轨道同源，轨道归属规则与 buildTimelineModel 一致。 */
export function projectDraftMatrix(project: Project): DraftMatrix {
  const tracks = resolveTracks(project);
  const trackIds = new Set(tracks.map((track) => track.id));
  const fallbackTrack = tracks[0]?.id ?? 'main';
  const byTrack = new Map<string, string[]>();
  const ordered = [...(project.chapters ?? [])].sort((a, b) => a.order - b.order);
  for (const chapter of ordered) {
    const trackId = chapter.trackId && trackIds.has(chapter.trackId) ? chapter.trackId : fallbackTrack;
    const list = byTrack.get(trackId);
    if (list) list.push(chapter.id);
    else byTrack.set(trackId, [chapter.id]);
  }
  return {
    tracks,
    lanes: tracks.map((track) => ({ trackId: track.id, clipIds: byTrack.get(track.id) ?? [] })),
  };
}

/** 把矩阵写回 chapters：按轨道展开重排 order 与 trackId，矩阵外的片段保留在末尾。 */
export function commitDraftMatrix(chapters: Chapter[], matrix: DraftMatrix): Chapter[] {
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const placed = new Set<string>();
  const ordered: Chapter[] = [];
  for (const lane of matrix.lanes) {
    for (const clipId of lane.clipIds) {
      const chapter = byId.get(clipId);
      if (!chapter || placed.has(clipId)) continue;
      placed.add(clipId);
      ordered.push({ ...chapter, trackId: lane.trackId, order: ordered.length });
    }
  }
  for (const chapter of chapters) {
    if (placed.has(chapter.id)) continue;
    ordered.push({ ...chapter, order: ordered.length });
  }
  return ordered;
}

/** 在矩阵内移动片段（跨轨落位），返回新矩阵；越界位置收敛到轨内边界。 */
export function moveInDraftMatrix(matrix: DraftMatrix, clipId: string, targetTrackId: string, targetIndex: number): DraftMatrix {
  const lanes: DraftMatrixLane[] = matrix.lanes.map((lane) => ({
    trackId: lane.trackId,
    clipIds: lane.clipIds.filter((id) => id !== clipId),
  }));
  const target = lanes.find((lane) => lane.trackId === targetTrackId) ?? lanes[0];
  if (!target) return matrix;
  const index = Math.max(0, Math.min(target.clipIds.length, Math.trunc(targetIndex)));
  target.clipIds.splice(index, 0, clipId);
  return { tracks: matrix.tracks, lanes };
}

/** 两个矩阵轨内次序是否一致（同源一致性校验）。 */
export function sameMatrix(a: DraftMatrix, b: DraftMatrix): boolean {
  if (a.lanes.length !== b.lanes.length) return false;
  return a.lanes.every((lane, index) => {
    const other = b.lanes[index];
    if (!other || other.trackId !== lane.trackId) return false;
    return lane.clipIds.length === other.clipIds.length && lane.clipIds.every((id, i) => other.clipIds[i] === id);
  });
}
