/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 算数值：按故事时间推算角色年龄。 */
import type { Project } from '@shared/types';

export interface AgeEvent {
  id: string;
  title: string;
  year: number;
}

export interface AgeRow {
  characterId: string;
  name: string;
  birthYear: number | null;
  ages: Array<{ eventId: string; year: number; age: number | null }>;
}

export function buildAgeTable(project: Project): { events: AgeEvent[]; rows: AgeRow[] } {
  const events: AgeEvent[] = (project.timeline?.events ?? [])
    .filter((event) => typeof event.date?.year === 'number')
    .map((event) => ({ id: event.id, title: event.title, year: event.date.year }))
    .sort((a, b) => a.year - b.year);

  const rows: AgeRow[] = (project.characters ?? []).map((character) => {
    const birthYear = typeof character.birthDate?.year === 'number' ? character.birthDate.year : null;
    return {
      characterId: character.id,
      name: character.name,
      birthYear,
      ages: events.map((event) => ({ eventId: event.id, year: event.year, age: birthYear === null ? null : event.year - birthYear })),
    };
  });

  return { events, rows };
}
