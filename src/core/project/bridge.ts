/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type {
  HistoryDate,
  HistoryEvent,
  MagicLevel,
  MagicSystem,
  Project,
  TechnologyLevel,
  Timeline,
  TimelineEvent,
  TimelineImpactId,
  WorldHistory,
} from '../../shared/types';
import type { AttributeEntity, BookEntities, EdgeEntity, EdgeKind, NodeEntity } from '../entities/types';
import { uuidv7 } from '../entities/uuid';
import { builtinRegistry, type TypeTemplate } from '../types-registry';

/**
 * 投影桥 —— 文档模型（Project，UI 现状）与六实体（存储真相）的双向映射。
 *
 * 设计要点（docs/design/03 §3 末现状映射）：
 *  - 确定性 id：edge/attr 的 id 由内容派生，保证同一 Project 两次投影哈希一致，
 *    entity_changes 只在真实变更时产生；
 *  - 模板驱动字段：标量存 label 属性、ref 存 relation 属性、数组/对象存 JSON label 属性，
 *    未声明字段兜底 JSON —— 对内置类型无损，对插件新类型宽容；
 *  - chapters[] 数组序 → contain 边 position；virtualChapters → role='virtual'。
 */

/** 集合 → 实体映射规格 */
interface CollectionSpec {
  /** Project 上的集合字段名（与字段同名；读写只走 readCollection/writeCollection，禁按任意字符串索引 Project） */
  key: CollectionKey;
  /** 节点类型模板 id */
  type: string;
  /** contain 边 role */
  role: string;
  /** 标题来源字段 */
  titleField: string;
  /** 正文来源字段（映射到 node.body） */
  bodyField?: string;
  /** 固定标题（无名称字段的集合） */
  fixedTitle?: string;
}

/** Project 上受管集合的字段名：键与字段一一对应。 */
type CollectionKey =
  | 'chapters'
  | 'virtualChapters'
  | 'characters'
  | 'locations'
  | 'factions'
  | 'ruleSystems'
  | 'knowledge'
  | 'foreshadows'
  | 'references';

/** 读 Project 上的集合：键限定在 CollectionKey，元素当未知结构（字段级由 fieldsToAttrs 逐项处理）。 */
function readCollection(project: Project, key: CollectionKey): unknown[] | undefined {
  return project[key];
}

/** 把投影出的集合写回 Project：单点收敛未知元素数组到集合元素数组。 */
function writeCollection<K extends CollectionKey>(project: Project, key: K, items: unknown[]): void {
  project[key] = items as Project[K];
}

const COLLECTIONS: readonly CollectionSpec[] = [
  { key: 'chapters', type: 'novel.chapter', role: 'chapter', titleField: 'title', bodyField: 'content' },
  { key: 'virtualChapters', type: 'novel.chapter', role: 'virtual', titleField: 'title', bodyField: 'content' },
  { key: 'characters', type: 'card.character', role: 'card', titleField: 'name' },
  { key: 'locations', type: 'card.location', role: 'card', titleField: 'name' },
  { key: 'factions', type: 'card.faction', role: 'card', titleField: 'name' },
  { key: 'ruleSystems', type: 'world.rule-system', role: 'world', titleField: 'name' },
  { key: 'knowledge', type: 'meta.knowledge', role: 'knowledge', titleField: 'name', bodyField: 'content' },
  { key: 'foreshadows', type: 'meta.foreshadow', role: 'meta', titleField: 'title' },
  { key: 'references', type: 'meta.reference', role: 'reference', titleField: 'title' },
];

/** 投影时从对象中剔除的键（已映射到实体列；createdAt/updatedAt 是领域数据字段，保留为属性） */
const SKIP_KEYS = new Set(['id', 'title', 'name', 'content']);

function makeEdge(fromId: string, toId: string, kind: EdgeKind, role: string | undefined, position: number, bookId: string): EdgeEntity {
  return {
    id: `e:${fromId}>${toId}:${kind}:${role ?? ''}`,
    fromId,
    toId,
    kind,
    role,
    position,
    bookId,
    erased: false,
  };
}

/** 对象字段 → 属性列表（模板驱动类型，未声明字段 JSON 兜底） */
function fieldsToAttrs(nodeId: string, obj: Record<string, unknown>, template: TypeTemplate | undefined): AttributeEntity[] {
  const attrs: AttributeEntity[] = [];
  let position = 0;
  for (const [key, value] of Object.entries(obj)) {
    if (SKIP_KEYS.has(key) || value === undefined || value === null) continue;
    const field = template?.fields.find((f) => f.key === key);
    let attrValue: string;
    let type: 'label' | 'relation' = 'label';
    if (typeof value === 'string') {
      attrValue = value;
      if (field?.type === 'ref') type = 'relation';
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      attrValue = String(value);
    } else {
      attrValue = JSON.stringify(value);
    }
    attrs.push({
      id: `a:${nodeId}:${key}`,
      nodeId,
      type,
      name: key,
      value: attrValue,
      inheritable: false,
      position: position++,
      erased: false,
    });
  }
  return attrs;
}

/** 属性值 → 字段值（按模板字段类型反序列化；未声明字段 JSON/数字试探） */
function attrToValue(attr: AttributeEntity, template: TypeTemplate | undefined): unknown {
  const field = template?.fields.find((f) => f.key === attr.name);
  switch (field?.type) {
    case 'number': {
      const n = Number(attr.value);
      return Number.isFinite(n) ? n : attr.value;
    }
    case 'boolean':
      return attr.value === 'true';
    case 'list':
    case 'json':
    case 'date': {
      try {
        return JSON.parse(attr.value);
      } catch {
        return attr.value;
      }
    }
    case 'ref':
    case 'text':
    case 'richtext':
    case 'enum':
    case 'image':
      return attr.value;
    default: {
      // 未声明字段：数字/布尔/对象试探还原，失败保持字符串
      if (attr.value === 'true') return true;
      if (attr.value === 'false') return false;
      const n = Number(attr.value);
      if (attr.value !== '' && Number.isFinite(n)) return n;
      try {
        const parsed: unknown = JSON.parse(attr.value);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
      } catch {
        /* keep string */
      }
      return attr.value;
    }
  }
}

function makeNode(
  id: string,
  type: string,
  title: string,
  bookId: string,
  body: string,
  createdAt: number,
  updatedAt: number
): NodeEntity {
  return { id, type, title, bookId, body, createdAt, updatedAt, erased: false };
}

/** Project → 六实体（书级）。now 注入以便测试确定性。 */
export function projectToEntities(project: Project, now = Date.now()): BookEntities {
  const nodes: NodeEntity[] = [];
  const edges: EdgeEntity[] = [];
  const attrs: AttributeEntity[] = [];
  const bookId = project.id;

  // 书节点：inspiration/intro/outline 为属性
  const bookNode = makeNode(
    bookId,
    'novel.book',
    project.title ?? '',
    bookId,
    '',
    project.lastModified ?? now,
    project.lastModified ?? now
  );
  nodes.push(bookNode);
  const bookFields: Record<string, unknown> = {
    inspiration: project.inspiration,
    intro: project.intro,
    outline: project.outline,
  };
  // 侧车/结构数据以 JSON 属性随书节点落库，round-trip 无损（分支、对照、绘本）。
  if (project.branching) bookFields.branching = project.branching;
  if (project.translation) bookFields.translation = project.translation;
  if (project.pictureBook) bookFields.pictureBook = project.pictureBook;
  attrs.push(...fieldsToAttrs(bookId, bookFields, builtinRegistry.get('novel.book')));

  // 平铺集合
  for (const spec of COLLECTIONS) {
    const list = readCollection(project, spec.key);
    if (!Array.isArray(list)) continue;
    const template = builtinRegistry.get(spec.type);
    list.forEach((item, index) => {
      const obj = item as Record<string, unknown>;
      const id = String(obj.id ?? uuidv7());
      const titleField = spec.titleField;
      const title = String(obj[titleField] ?? obj.title ?? '');
      const body = spec.bodyField ? String(obj[spec.bodyField] ?? '') : '';
      nodes.push(makeNode(id, spec.type, title, bookId, body, now, now));
      const order = typeof obj.order === 'number' ? obj.order : index;
      edges.push(makeEdge(bookId, id, 'contain', spec.role, order, bookId));
      attrs.push(...fieldsToAttrs(id, obj, template));
    });
  }

  // 插件扩展类型：project.extensions[type] → 节点 + contain 边（role 'extension'），核心不解释其结构
  for (const [type, list] of Object.entries(project.extensions ?? {})) {
    if (!Array.isArray(list)) continue;
    const template = builtinRegistry.get(type);
    list.forEach((item, index) => {
      const obj = item as Record<string, unknown>;
      const id = String(obj.id ?? uuidv7());
      const title = String(obj.title ?? obj.name ?? '');
      const body = String(obj.body ?? '');
      nodes.push(makeNode(id, type, title, bookId, body, now, now));
      const order = typeof obj.order === 'number' ? obj.order : index;
      edges.push(makeEdge(bookId, id, 'contain', 'extension', order, bookId));
      attrs.push(...fieldsToAttrs(id, obj, template));
    });
  }

  // 世界观（单对象拆三节点，时间戳取 worldView 自身）
  const wv = project.worldView;
  if (wv) {
    if (wv.magicSystem) {
      const id = `${bookId}:world.magic-system`;
      nodes.push(makeNode(id, 'world.magic-system', wv.magicSystem.name ?? '', bookId, '', wv.createdAt, wv.updatedAt));
      edges.push(makeEdge(bookId, id, 'contain', 'world', 0, bookId));
      // 领域接口没有索引签名：展开得到匿名对象类型后再交给逐字段枚举，避免整体强转。
      attrs.push(...fieldsToAttrs(id, { ...wv.magicSystem }, builtinRegistry.get('world.magic-system')));
    }
    if (wv.technologyLevel) {
      const id = `${bookId}:world.tech-level`;
      nodes.push(makeNode(id, 'world.tech-level', wv.technologyLevel.era ?? '', bookId, '', wv.createdAt, wv.updatedAt));
      edges.push(makeEdge(bookId, id, 'contain', 'world', 1, bookId));
      attrs.push(...fieldsToAttrs(id, { ...wv.technologyLevel }, builtinRegistry.get('world.tech-level')));
    }
    if (wv.history) {
      const id = `${bookId}:world.history`;
      nodes.push(makeNode(id, 'world.history', '世界历史', bookId, '', wv.createdAt, wv.updatedAt));
      edges.push(makeEdge(bookId, id, 'contain', 'world', 2, bookId));
      attrs.push(...fieldsToAttrs(id, { ...wv.history }, builtinRegistry.get('world.history')));
    }
  }

  // 时间线（容器节点 + 事件子节点）
  const tl = project.timeline;
  if (tl) {
    const timelineNode = makeNode(tl.id, 'meta.timeline', tl.config?.name ?? '时间线', bookId, '', tl.createdAt, tl.updatedAt);
    nodes.push(timelineNode);
    edges.push(makeEdge(bookId, tl.id, 'contain', 'meta', 0, bookId));
    attrs.push(
      ...fieldsToAttrs(
        tl.id,
        { calendarSystem: tl.config?.calendarSystem, startYear: tl.config?.startYear },
        builtinRegistry.get('meta.timeline')
      )
    );
    // name 在 SKIP_KEYS 中（卡片场景由 title 承载），时间线容器需显式保留名称属性
    if (tl.config?.name !== undefined) {
      attrs.push({
        id: `a:${tl.id}:name`, nodeId: tl.id, type: 'label', name: 'name',
        value: tl.config.name, inheritable: false, position: 99, erased: false,
      });
    }
    (tl.events ?? []).forEach((ev, index) => {
      nodes.push(makeNode(ev.id, 'meta.timeline-event', ev.title ?? '', bookId, '', now, now));
      edges.push(makeEdge(tl.id, ev.id, 'contain', 'event', typeof ev.order === 'number' ? ev.order : index, bookId));
      attrs.push(...fieldsToAttrs(ev.id, { ...ev }, builtinRegistry.get('meta.timeline-event')));
    });
  }

  return { nodes, edges, attrs };
}

/** 读侧窄化函数组：属性反序列化的产物是 Record<string, unknown>，按结构体逐字段校验后再使用，
 * 不做整体强转（脏字段不能绕过领域类型）。必填字段缺失或类型不符即丢弃该对象；
 * 可选字段逐项窄化后补，未声明字段由展开保留（与写入侧的宽容兜底一致）。 */

/** 事件类型枚举（TimelineEvent.type 的合法值）。 */
const TIMELINE_EVENT_TYPES = ['plot', 'character', 'world', 'faction', 'battle', 'discovery', 'other'] as const;

/** 读字符串；空串是合法领域值（空描述/空概述），只有非字符串判脏。 */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** 读字符串数组：任一元素不是字符串即整体判脏，不静默丢元素。 */
function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') return undefined;
    items.push(entry);
  }
  return items;
}

/** 读有限数；NaN/Infinity 判脏。 */
function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 读布尔值。 */
function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** 读事件影响级别（significance）：只认已定义的枚举值。 */
function readImpactId(value: unknown): TimelineImpactId | undefined {
  return value === 'major' || value === 'minor' ? value : undefined;
}

/** 读时间线事件类型：按枚举逐个比对（不用 includes + 强转）。 */
function readEventType(value: unknown): TimelineEvent['type'] | undefined {
  for (const type of TIMELINE_EVENT_TYPES) {
    if (value === type) return type;
  }
  return undefined;
}

/** 把未知值当对象读（非对象返回 undefined）。 */
function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** 读魔法等级：name/description/order 必填；requirements/abilities 可选。 */
function readMagicLevel(data: Record<string, unknown>): MagicLevel | undefined {
  const name = readString(data.name);
  const description = readString(data.description);
  const order = readNumber(data.order);
  if (name === undefined || description === undefined || order === undefined) return undefined;
  const level: MagicLevel = { name, description, order };
  const requirements = readString(data.requirements);
  if (requirements !== undefined) level.requirements = requirements;
  const abilities = readString(data.abilities);
  if (abilities !== undefined) level.abilities = abilities;
  // 未声明字段由展开保留；已校验字段覆盖在后，保证必填项是校验过的值。
  return { ...data, ...level };
}

/** 读魔法等级列表：非数组判脏；脏条目只丢自己，其余等级照常读出。 */
function readMagicLevels(value: unknown): MagicLevel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const levels: MagicLevel[] = [];
  for (const entry of value) {
    const data = readRecord(entry);
    const level = data === undefined ? undefined : readMagicLevel(data);
    if (level) levels.push(level);
  }
  return levels;
}

/** 读魔法体系：name/description/rules/limitations 必填；castingMethod/levels 可选。 */
function readMagicSystem(data: Record<string, unknown>): MagicSystem | undefined {
  const name = readString(data.name);
  const description = readString(data.description);
  const rules = readStringArray(data.rules);
  const limitations = readString(data.limitations);
  if (name === undefined || description === undefined || rules === undefined || limitations === undefined) return undefined;
  const system: MagicSystem = { name, description, rules, limitations };
  const castingMethod = readString(data.castingMethod);
  if (castingMethod !== undefined) system.castingMethod = castingMethod;
  const levels = readMagicLevels(data.levels);
  if (levels !== undefined) system.levels = levels;
  return { ...data, ...system };
}

/** 读科技水平：era/description/keyTechnologies/limitations 必填；能源/交通/通讯可选。 */
function readTechnologyLevel(data: Record<string, unknown>): TechnologyLevel | undefined {
  const era = readString(data.era);
  const description = readString(data.description);
  const keyTechnologies = readStringArray(data.keyTechnologies);
  const limitations = readString(data.limitations);
  if (era === undefined || description === undefined || keyTechnologies === undefined || limitations === undefined) return undefined;
  const tech: TechnologyLevel = { era, description, keyTechnologies, limitations };
  const energySource = readString(data.energySource);
  if (energySource !== undefined) tech.energySource = energySource;
  const transportation = readString(data.transportation);
  if (transportation !== undefined) tech.transportation = transportation;
  const communication = readString(data.communication);
  if (communication !== undefined) tech.communication = communication;
  return { ...data, ...tech };
}

/** 读历史日期：year 必填；月/日/显示格式/虚构历法标记可选。 */
function readHistoryDate(data: Record<string, unknown>): HistoryDate | undefined {
  const year = readNumber(data.year);
  if (year === undefined) return undefined;
  const date: HistoryDate = { year };
  const month = readNumber(data.month);
  if (month !== undefined) date.month = month;
  const day = readNumber(data.day);
  if (day !== undefined) date.day = day;
  const display = readString(data.display);
  if (display !== undefined) date.display = display;
  const isFictional = readBoolean(data.isFictional);
  if (isFictional !== undefined) date.isFictional = isFictional;
  return { ...data, ...date };
}

/** 读历史事件：id/date/title/description 必填；impact 与两组关联 id 可选。 */
function readHistoryEvent(data: Record<string, unknown>): HistoryEvent | undefined {
  const id = readString(data.id);
  const dateData = readRecord(data.date);
  const date = dateData === undefined ? undefined : readHistoryDate(dateData);
  const title = readString(data.title);
  const description = readString(data.description);
  if (id === undefined || date === undefined || title === undefined || description === undefined) return undefined;
  const event: HistoryEvent = { id, date, title, description };
  const impact = readString(data.impact);
  if (impact !== undefined) event.impact = impact;
  const relatedCharacterIds = readStringArray(data.relatedCharacterIds);
  if (relatedCharacterIds !== undefined) event.relatedCharacterIds = relatedCharacterIds;
  const relatedLocationIds = readStringArray(data.relatedLocationIds);
  if (relatedLocationIds !== undefined) event.relatedLocationIds = relatedLocationIds;
  return { ...data, ...event };
}

/** 读历史事件列表：非数组判脏；脏条目只丢自己。 */
function readHistoryEvents(value: unknown): HistoryEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const events: HistoryEvent[] = [];
  for (const entry of value) {
    const data = readRecord(entry);
    const event = data === undefined ? undefined : readHistoryEvent(data);
    if (event) events.push(event);
  }
  return events;
}

/** 读世界历史：overview/keyEvents 必填；calendarSystem 可选。 */
function readWorldHistory(data: Record<string, unknown>): WorldHistory | undefined {
  const overview = readString(data.overview);
  const keyEvents = readHistoryEvents(data.keyEvents);
  if (overview === undefined || keyEvents === undefined) return undefined;
  const history: WorldHistory = { overview, keyEvents };
  const calendarSystem = readString(data.calendarSystem);
  if (calendarSystem !== undefined) history.calendarSystem = calendarSystem;
  return { ...data, ...history };
}

/** 读时间线事件：id/date/title/description/type 必填；影响、三组关联 id、章节关联、顺序可选。 */
function readTimelineEvent(data: Record<string, unknown>): TimelineEvent | undefined {
  const id = readString(data.id);
  const dateData = readRecord(data.date);
  const date = dateData === undefined ? undefined : readHistoryDate(dateData);
  const title = readString(data.title);
  const description = readString(data.description);
  const type = readEventType(data.type);
  if (id === undefined || date === undefined || title === undefined || description === undefined || type === undefined) return undefined;
  const event: TimelineEvent = { id, date, title, description, type };
  const impact = readString(data.impact);
  if (impact !== undefined) event.impact = impact;
  const significance = readImpactId(data.significance);
  if (significance !== undefined) event.significance = significance;
  const relatedCharacterIds = readStringArray(data.relatedCharacterIds);
  if (relatedCharacterIds !== undefined) event.relatedCharacterIds = relatedCharacterIds;
  const relatedLocationIds = readStringArray(data.relatedLocationIds);
  if (relatedLocationIds !== undefined) event.relatedLocationIds = relatedLocationIds;
  const relatedFactionIds = readStringArray(data.relatedFactionIds);
  if (relatedFactionIds !== undefined) event.relatedFactionIds = relatedFactionIds;
  const relatedChapterId = readString(data.relatedChapterId);
  if (relatedChapterId !== undefined) event.relatedChapterId = relatedChapterId;
  const order = readNumber(data.order);
  if (order !== undefined) event.order = order;
  return { ...data, ...event };
}

/** 实体 → Project（书级）。erased 实体退出投影。 */
export function entitiesToProject(entities: BookEntities): Project {
  const nodes = entities.nodes.filter((n) => !n.erased);
  const edges = entities.edges.filter((e) => !e.erased);
  const attrs = entities.attrs.filter((a) => !a.erased);

  const book = nodes.find((n) => n.type === 'novel.book');
  if (!book) throw new Error('投影失败：缺少 novel.book 根节点');
  const bookId = book.id;

  const attrsByNode = new Map<string, AttributeEntity[]>();
  for (const a of attrs) {
    const list = attrsByNode.get(a.nodeId);
    if (list) list.push(a);
    else attrsByNode.set(a.nodeId, [a]);
  }

  /** 节点 → 文档对象：title/body 回填 + 属性反序列化。titleField='' 表示无名称字段；
   *  includeId=false 用于世界观子对象（领域类型无 id 字段，id 由节点列承载）。 */
  const nodeToObj = (node: NodeEntity, titleField: string, bodyField?: string, includeId = true): Record<string, unknown> => {
    const template = builtinRegistry.get(node.type);
    const obj: Record<string, unknown> = includeId ? { id: node.id } : {};
    if (titleField) obj[titleField] = node.title;
    if (bodyField) obj[bodyField] = node.body;
    for (const a of attrsByNode.get(node.id) ?? []) {
      obj[a.name] = attrToValue(a, template);
    }
    return obj;
  };

  const bookAttr = (name: string): string | undefined =>
    (attrsByNode.get(bookId) ?? []).find((a) => a.name === name)?.value;
  const bookJson = (name: string): unknown => {
    const raw = bookAttr(name);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };

  const project: Project = {
    id: bookId,
    title: book.title,
    inspiration: bookAttr('inspiration') ?? '',
    intro: bookAttr('intro') ?? '',
    characters: [],
    outline: bookAttr('outline') ?? '',
    chapters: [],
    virtualChapters: [],
    knowledge: [],
    lastModified: book.updatedAt,
  };

  // 按 contain 边 role 分派；同级按 position 排序
  const children = edges
    .filter((e) => e.fromId === bookId && e.kind === 'contain')
    .sort((a, b) => a.position - b.position);

  for (const edge of children) {
    const node = nodes.find((n) => n.id === edge.toId);
    if (!node) continue; // 骨架边（目标未到达）跳过，索引器负责完整性报告
    if (node.type === 'novel.book') continue;
    const spec = COLLECTIONS.find((c) => c.type === node.type && c.role === edge.role);
    if (spec) {
      const obj = nodeToObj(node, spec.titleField, spec.bodyField);
      const list = readCollection(project, spec.key) ?? [];
      list.push(obj);
      writeCollection(project, spec.key, list);
      continue;
    }
    if (node.type === 'meta.timeline') {
      const obj = nodeToObj(node, '');
      const events: TimelineEvent[] = edges
        .filter((e) => e.fromId === node.id && e.role === 'event')
        .sort((a, b) => a.position - b.position)
        .map((e) => nodes.find((n) => n.id === e.toId))
        .filter((n): n is NodeEntity => n !== undefined)
        .map((ev) => readTimelineEvent(nodeToObj(ev, 'title')))
        .filter((ev): ev is TimelineEvent => ev !== undefined);
      project.timeline = {
        id: node.id,
        projectId: bookId,
        config: {
          calendarSystem: String(obj.calendarSystem ?? ''),
          startYear: typeof obj.startYear === 'number' ? obj.startYear : undefined,
          name: obj.name === undefined ? undefined : String(obj.name),
        },
        events,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      } satisfies Timeline;
    } else if (node.type.startsWith('world.')) {
      const titleField = node.type === 'world.magic-system' ? 'name' : node.type === 'world.tech-level' ? 'era' : '';
      const obj = nodeToObj(node, titleField, undefined, false);
      project.worldView ??= {
        id: `${bookId}:worldView`,
        projectId: bookId,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      };
      if (node.type === 'world.magic-system') {
        const magicSystem = readMagicSystem(obj);
        if (magicSystem) project.worldView.magicSystem = magicSystem;
      } else if (node.type === 'world.tech-level') {
        const technologyLevel = readTechnologyLevel(obj);
        if (technologyLevel) project.worldView.technologyLevel = technologyLevel;
      } else if (node.type === 'world.history') {
        const history = readWorldHistory(obj);
        if (history) project.worldView.history = history;
      }
    } else {
      // 未知（插件扩展）类型：按 node.type 归入 extensions，核心不解释其结构
      const bag = (project.extensions ??= {});
      (bag[node.type] ??= []).push(nodeToObj(node, 'title', 'body'));
    }
  }

  // 侧车/结构数据随书节点恢复（分支、对照、绘本）。
  const branching = bookJson('branching');
  if (branching && typeof branching === 'object') project.branching = branching as Project['branching'];
  const translation = bookJson('translation');
  if (translation && typeof translation === 'object') project.translation = translation as Project['translation'];
  const pictureBook = bookJson('pictureBook');
  if (pictureBook && typeof pictureBook === 'object') project.pictureBook = pictureBook as Project['pictureBook'];

  return project;
}
