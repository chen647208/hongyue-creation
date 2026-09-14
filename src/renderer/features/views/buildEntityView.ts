/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 把作品的世界要素拍平为视图行与关系边。 */
import type { HistoryDate, Project } from '@shared/types';

import type { EntityViewData, ViewColumn, ViewLink, ViewRow } from './types';

export const ENTITY_VIEW_COLUMNS: ViewColumn[] = [
  { key: 'kind', label: 'views.col.kind', width: 96 },
  { key: 'title', label: 'views.col.title', width: 180 },
  { key: 'summary', label: 'views.col.summary', width: 220 },
  { key: 'detail', label: 'views.col.detail', width: 280 },
];

function formatDate(date: HistoryDate | undefined): string {
  if (!date) return '';
  if (date.display) return date.display;
  const parts = [date.year, date.month, date.day].filter((value): value is number => typeof value === 'number');
  return parts.join('-');
}

export function buildEntityView(project: Project): EntityViewData {
  const rows: ViewRow[] = [];
  const links: ViewLink[] = [];

  const characters = project.characters ?? [];
  const locations = project.locations ?? [];
  const factions = project.factions ?? [];
  const events = project.timeline?.events ?? [];

  const locationName = new Map(locations.map((location) => [location.id, location.name]));
  const factionName = new Map(factions.map((faction) => [faction.id, faction.name]));
  const characterName = new Map(characters.map((character) => [character.id, character.name]));

  for (const character of characters) {
    const ageNumber = Number(character.age);
    rows.push({
      id: character.id,
      kind: 'character',
      title: character.name,
      cells: {
        kind: 'character',
        title: character.name,
        summary: character.occupation || character.role,
        detail: character.currentLocationId ? (locationName.get(character.currentLocationId) ?? '') : '',
      },
      values: {
        kind: 'character',
        title: character.name,
        name: character.name,
        summary: character.occupation || character.role,
        detail: character.currentLocationId ? (locationName.get(character.currentLocationId) ?? '') : '',
        gender: character.gender,
        age: Number.isFinite(ageNumber) && character.age.trim() !== '' ? ageNumber : null,
        role: character.role,
        occupation: character.occupation,
        factionId: character.factionId ?? '',
        currentLocationId: character.currentLocationId ?? '',
      },
    });
    if (character.factionId && factionName.has(character.factionId)) {
      links.push({ source: character.id, target: character.factionId, label: 'belongs' });
    }
    if (character.currentLocationId && locationName.has(character.currentLocationId)) {
      links.push({ source: character.id, target: character.currentLocationId, label: 'located' });
    }
  }

  for (const location of locations) {
    rows.push({
      id: location.id,
      kind: 'location',
      title: location.name,
      cells: {
        kind: 'location',
        title: location.name,
        summary: location.type,
        detail: location.controlledBy ? (factionName.get(location.controlledBy) ?? '') : '',
      },
      values: {
        kind: 'location',
        title: location.name,
        name: location.name,
        summary: location.type,
        detail: location.controlledBy ? (factionName.get(location.controlledBy) ?? '') : '',
        type: location.type,
        controlledBy: location.controlledBy ?? '',
      },
    });
    if (location.controlledBy && factionName.has(location.controlledBy)) {
      links.push({ source: location.id, target: location.controlledBy, label: 'controls' });
    }
  }

  for (const faction of factions) {
    const memberCount = faction.memberCharacterIds?.length ?? 0;
    rows.push({
      id: faction.id,
      kind: 'faction',
      title: faction.name,
      cells: {
        kind: 'faction',
        title: faction.name,
        summary: faction.type,
        detail: memberCount > 0 ? String(memberCount) : '',
      },
      values: {
        kind: 'faction',
        title: faction.name,
        name: faction.name,
        summary: faction.type,
        detail: memberCount > 0 ? String(memberCount) : '',
        type: faction.type,
        memberCount,
      },
    });
    if (faction.leaderId && characterName.has(faction.leaderId)) {
      links.push({ source: faction.leaderId, target: faction.id, label: 'leads' });
    }
  }

  for (const event of events) {
    rows.push({
      id: event.id,
      kind: 'event',
      title: event.title,
      cells: {
        kind: 'event',
        title: event.title,
        summary: formatDate(event.date),
        detail: event.description,
      },
      values: {
        kind: 'event',
        title: event.title,
        name: event.title,
        summary: formatDate(event.date),
        detail: event.description,
        type: event.type,
        date: event.date,
        year: event.date?.year ?? null,
        month: event.date?.month ?? null,
        day: event.date?.day ?? null,
      },
    });
    for (const id of event.relatedCharacterIds ?? []) {
      if (characterName.has(id)) links.push({ source: event.id, target: id, label: 'involves' });
    }
    for (const id of event.relatedLocationIds ?? []) {
      if (locationName.has(id)) links.push({ source: event.id, target: id, label: 'involves' });
    }
    for (const id of event.relatedFactionIds ?? []) {
      if (factionName.has(id)) links.push({ source: event.id, target: id, label: 'involves' });
    }
  }

  return { columns: ENTITY_VIEW_COLUMNS, rows, links };
}
