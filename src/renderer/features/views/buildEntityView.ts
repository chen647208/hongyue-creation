/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 跨域视图投影：把作品内任一域的条目拍平为视图行。
 *
 * 域覆盖章节（含虚拟章节）、实体（角色/地点/势力/事件）、清单项（知识库/伏笔/计划/分组）、
 * 规则与世界观、以及 `Project.extensions` 里的扩展类型；列与公式取数不写死六实体。
 * 扩充类型/扩展类型经同一函数投影：扩展条目的自有字段直接成为行字段，
 * 章节正文的 `# @键: 值` 行经 parseKeywordAttributes 成为行字段（分镜镜头由此进入行数据源）。
 */
import { stripBlockAnchors } from '@core/dsl/anchor';
import { parseCitations } from '@core/dsl/citation';
import { parseKeywordAttributes } from '@core/dsl/keywords';
import { countWords } from '@core/index/words';
import { formulaDisplay } from '@shared/formulaScript';
import type { Chapter, HistoryDate, Project } from '@shared/types';

import { projectBranchData, validateProjectBranching } from './branchView';
import { buildComparisonView } from './comparisonView';
import type { EntityViewData, ViewColumn, ViewLink, ViewRow } from './types';

export const ENTITY_VIEW_COLUMNS: ViewColumn[] = [
  { key: 'kind', label: 'views.col.kind', width: 96 },
  { key: 'title', label: 'views.col.title', width: 180 },
  { key: 'summary', label: 'views.col.summary', width: 220 },
  { key: 'detail', label: 'views.col.detail', width: 280 },
];

function formatDate(date: HistoryDate | undefined): string {
  if (!date) return '';
  return formulaDisplay(date);
}

/** 把一组字段拍平为一行：cells 存显示文本，values 存原始值（条件/公式取数用）。 */
function flattenRow(id: string, kind: string, title: string, fields: Record<string, unknown>): ViewRow {
  const values: Record<string, unknown> = { kind, title, ...fields };
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) cells[key] = formulaDisplay(value);
  return { id, kind, title, cells, values };
}

/** 章节行：正文 DSL 关键字（如分镜的 画面/景别）作为行字段暴露。 */
function buildChapterRow(chapter: Chapter, virtual: boolean): ViewRow {
  const keywords = parseKeywordAttributes(chapter.content);
  return flattenRow(chapter.id, 'chapter', chapter.title, {
    name: chapter.title,
    summary: chapter.summary,
    contentSummary: chapter.contentSummary ?? '',
    order: chapter.order,
    status: chapter.status ?? 'draft',
    virtual,
    material: chapter.material === true,
    mainLocationId: chapter.mainLocationId ?? '',
    involvedFactionIds: chapter.involvedFactionIds ?? [],
    timelineEventId: chapter.timelineEventId ?? '',
    storyDate: chapter.storyDate,
    duration: chapter.duration,
    tension: chapter.tension,
    trackId: chapter.trackId ?? '',
    groupId: chapter.groupId ?? '',
    wordCount: countWords(stripBlockAnchors(chapter.content)),
    contentLength: chapter.content.length,
    ...keywords,
  });
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
    rows.push(
      flattenRow(character.id, 'character', character.name, {
        name: character.name,
        summary: character.occupation || character.role,
        detail: character.currentLocationId ? (locationName.get(character.currentLocationId) ?? '') : '',
        gender: character.gender,
        age: Number.isFinite(ageNumber) && character.age.trim() !== '' ? ageNumber : null,
        role: character.role,
        occupation: character.occupation,
        factionId: character.factionId ?? '',
        currentLocationId: character.currentLocationId ?? '',
      }),
    );
    if (character.factionId && factionName.has(character.factionId)) {
      links.push({ source: character.id, target: character.factionId, label: 'belongs' });
    }
    if (character.currentLocationId && locationName.has(character.currentLocationId)) {
      links.push({ source: character.id, target: character.currentLocationId, label: 'located' });
    }
  }

  for (const location of locations) {
    rows.push(
      flattenRow(location.id, 'location', location.name, {
        name: location.name,
        summary: location.type,
        detail: location.controlledBy ? (factionName.get(location.controlledBy) ?? '') : '',
        type: location.type,
        controlledBy: location.controlledBy ?? '',
      }),
    );
    if (location.controlledBy && factionName.has(location.controlledBy)) {
      links.push({ source: location.id, target: location.controlledBy, label: 'controls' });
    }
  }

  for (const faction of factions) {
    const memberCount = faction.memberCharacterIds?.length ?? 0;
    rows.push(
      flattenRow(faction.id, 'faction', faction.name, {
        name: faction.name,
        summary: faction.type,
        detail: memberCount > 0 ? String(memberCount) : '',
        type: faction.type,
        memberCount,
      }),
    );
    if (faction.leaderId && characterName.has(faction.leaderId)) {
      links.push({ source: faction.leaderId, target: faction.id, label: 'leads' });
    }
  }

  for (const event of events) {
    rows.push(
      flattenRow(event.id, 'event', event.title, {
        name: event.title,
        summary: formatDate(event.date),
        detail: event.description,
        type: event.type,
        date: event.date,
        year: event.date?.year ?? null,
        month: event.date?.month ?? null,
        day: event.date?.day ?? null,
      }),
    );
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

  for (const chapter of project.chapters ?? []) {
    rows.push(buildChapterRow(chapter, false));
  }
  for (const chapter of project.virtualChapters ?? []) {
    rows.push(buildChapterRow(chapter, true));
  }

  for (const item of project.knowledge ?? []) {
    rows.push(
      flattenRow(item.id, 'knowledge', item.name, {
        name: item.name,
        summary: item.category,
        detail: item.type,
        category: item.category,
        type: item.type,
        size: item.size,
        addedAt: item.addedAt,
      }),
    );
  }

  for (const foreshadow of project.foreshadows ?? []) {
    rows.push(
      flattenRow(foreshadow.id, 'foreshadow', foreshadow.title, {
        name: foreshadow.title,
        summary: foreshadow.status,
        detail: foreshadow.detail,
        status: foreshadow.status,
        importance: foreshadow.importance,
        plantedChapterId: foreshadow.plantedChapterId ?? '',
        plantedChapterOrder: foreshadow.plantedChapterOrder ?? null,
        payoffChapterId: foreshadow.payoffChapterId ?? '',
        payoffChapterOrder: foreshadow.payoffChapterOrder ?? null,
        tags: foreshadow.tags,
        notes: foreshadow.notes ?? '',
      }),
    );
  }

  for (const rule of project.ruleSystems ?? []) {
    rows.push(
      flattenRow(rule.id, 'rule', rule.name, {
        name: rule.name,
        summary: rule.type,
        detail: rule.description,
        type: rule.type,
        levelCount: rule.levels?.length ?? 0,
      }),
    );
  }

  const world = project.worldView;
  if (world?.magicSystem) {
    rows.push(
      flattenRow(world.magicSystem.name || `${world.id}:magic`, 'world', world.magicSystem.name, {
        name: world.magicSystem.name,
        summary: 'magic',
        detail: world.magicSystem.description,
        worldKind: 'magic',
        castingMethod: world.magicSystem.castingMethod ?? '',
        ruleCount: world.magicSystem.rules?.length ?? 0,
      }),
    );
  }
  if (world?.technologyLevel) {
    rows.push(
      flattenRow(`${world.id}:tech`, 'world', world.technologyLevel.era, {
        name: world.technologyLevel.era,
        summary: 'tech',
        detail: world.technologyLevel.description,
        worldKind: 'tech',
        energySource: world.technologyLevel.energySource ?? '',
        keyTechnologyCount: world.technologyLevel.keyTechnologies?.length ?? 0,
      }),
    );
  }
  if (world?.history) {
    rows.push(
      flattenRow(`${world.id}:history`, 'world', 'history', {
        name: 'history',
        summary: 'history',
        detail: world.history.overview,
        worldKind: 'history',
        calendarSystem: world.history.calendarSystem ?? '',
        keyEventCount: world.history.keyEvents?.length ?? 0,
      }),
    );
  }

  for (const item of project.plan ?? []) {
    rows.push(
      flattenRow(item.id, 'plan', item.title, {
        name: item.title,
        summary: item.stage,
        detail: item.note ?? '',
        stage: item.stage,
        status: item.status,
        order: item.order,
      }),
    );
  }

  for (const group of project.groups ?? []) {
    rows.push(
      flattenRow(group.id, 'group', group.label, {
        name: group.label,
        summary: '',
        detail: group.color ?? '',
        color: group.color ?? '',
        order: group.order,
      }),
    );
  }

  // 参考文献来源：结构化字段拍平为行，供视图管理与导出取数。
  const referenceByKey = new Map<string, string>();
  for (const reference of project.references ?? []) {
    const key = reference.citekey || reference.id;
    referenceByKey.set(key, reference.id);
    rows.push(
      flattenRow(reference.id, 'reference', reference.title, {
        name: reference.title,
        summary: [reference.authors, reference.year].filter(Boolean).join(' · '),
        detail: reference.container || reference.publisher || reference.url || '',
        citekey: key,
        refType: reference.type,
        authors: reference.authors ?? '',
        year: reference.year ?? '',
        container: reference.container ?? '',
      }),
    );
  }

  // 正文引文 → 来源：与来源行共同构成双向关联（反向由 buildCitationUsage 提供）。
  if ((project.references ?? []).length > 0) {
    for (const chapter of project.chapters ?? []) {
      const content = chapter.content ?? '';
      if (!content.includes('[@')) continue;
      for (const hit of parseCitations(content)) {
        for (const item of hit.items) {
          const target = referenceByKey.get(item.key);
          if (target) links.push({ source: chapter.id, target, label: 'cites' });
        }
      }
    }
  }

  // 分支叙事：场景成行、选择项成边，完整性问题写入 detail；数据取自 Project.branching。
  const branch = projectBranchData(project);
  if (branch.scenes.length > 0) {
    const issuesByScene = new Map<string, string[]>();
    for (const issue of validateProjectBranching(project)) {
      const list = issuesByScene.get(issue.sceneId) ?? [];
      list.push(issue.kind);
      issuesByScene.set(issue.sceneId, list);
    }
    const known = new Set(branch.scenes.map((scene) => scene.id));
    for (const scene of branch.scenes) {
      const choices = scene.choices ?? [];
      rows.push(
        flattenRow(scene.id, 'branch-scene', scene.title, {
          name: scene.title,
          summary: String(choices.length),
          detail: (issuesByScene.get(scene.id) ?? []).join(', '),
          ending: scene.ending === true,
          choiceCount: choices.length,
        }),
      );
      for (const choice of choices) {
        if (known.has(choice.target)) links.push({ source: scene.id, target: choice.target, label: choice.text });
      }
    }
  }

  // 对照视图：原文/译文段成行，确认状态随 Project.translation 同源。
  const comparison = buildComparisonView(project.translation);
  if (comparison.rows.length > 0) rows.push(...comparison.rows);

  // 绘本页：页序与图位投影为行，供视图管理图位替换。
  (project.pictureBook?.pages ?? []).forEach((page, index) => {
    rows.push(
      flattenRow(page.id, 'picture-page', page.title, {
        name: page.title,
        summary: String(index + 1),
        detail: page.caption ?? '',
        order: index + 1,
        imageId: page.imageId ?? '',
        imageAlt: page.imageAlt ?? '',
        caption: page.caption ?? '',
        text: page.text,
        hasImage: Boolean(page.imageId),
      }),
    );
  });

  // 扩展类型：project.extensions[type] 的条目直接投影，字段键保持条目原样。
  for (const [type, list] of Object.entries(project.extensions ?? {})) {
    if (!Array.isArray(list)) continue;
    list.forEach((entry, index) => {
      const obj = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
      const id = typeof obj.id === 'string' && obj.id !== '' ? obj.id : `${type}#${index}`;
      const title = String(obj.title ?? obj.name ?? '');
      rows.push(
        flattenRow(id, type, title, {
          name: obj.name ?? title,
          summary: obj.summary ?? '',
          detail: obj.detail ?? obj.description ?? '',
          ...obj,
        }),
      );
    });
  }

  return { columns: ENTITY_VIEW_COLUMNS, rows, links };
}
