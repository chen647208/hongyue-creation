/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type {
  MagicSystem,
  Project,
  TechnologyLevel,
  Timeline,
  TimelineEvent,
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
  /** Project 上的键 */
  key: string;
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
  attrs.push(
    ...fieldsToAttrs(
      bookId,
      { inspiration: project.inspiration, intro: project.intro, outline: project.outline },
      builtinRegistry.get('novel.book')
    )
  );

  // 平铺集合
  for (const spec of COLLECTIONS) {
    const list = (project as unknown as Record<string, unknown[]>)[spec.key];
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
      attrs.push(...fieldsToAttrs(id, wv.magicSystem as unknown as Record<string, unknown>, builtinRegistry.get('world.magic-system')));
    }
    if (wv.technologyLevel) {
      const id = `${bookId}:world.tech-level`;
      nodes.push(makeNode(id, 'world.tech-level', wv.technologyLevel.era ?? '', bookId, '', wv.createdAt, wv.updatedAt));
      edges.push(makeEdge(bookId, id, 'contain', 'world', 1, bookId));
      attrs.push(...fieldsToAttrs(id, wv.technologyLevel as unknown as Record<string, unknown>, builtinRegistry.get('world.tech-level')));
    }
    if (wv.history) {
      const id = `${bookId}:world.history`;
      nodes.push(makeNode(id, 'world.history', '世界历史', bookId, '', wv.createdAt, wv.updatedAt));
      edges.push(makeEdge(bookId, id, 'contain', 'world', 2, bookId));
      attrs.push(...fieldsToAttrs(id, wv.history as unknown as Record<string, unknown>, builtinRegistry.get('world.history')));
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
      attrs.push(...fieldsToAttrs(ev.id, ev as unknown as Record<string, unknown>, builtinRegistry.get('meta.timeline-event')));
    });
  }

  return { nodes, edges, attrs };
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
      const bag = project as unknown as Record<string, unknown[] | undefined>;
      const list = (bag[spec.key] ??= []);
      list.push(obj);
      continue;
    }
    if (node.type === 'meta.timeline') {
      const obj = nodeToObj(node, '');
      const events: TimelineEvent[] = edges
        .filter((e) => e.fromId === node.id && e.role === 'event')
        .sort((a, b) => a.position - b.position)
        .map((e) => nodes.find((n) => n.id === e.toId))
        .filter((n): n is NodeEntity => n !== undefined)
        .map((ev) => nodeToObj(ev, 'title') as unknown as TimelineEvent);
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
      if (node.type === 'world.magic-system') project.worldView.magicSystem = obj as unknown as MagicSystem;
      else if (node.type === 'world.tech-level') project.worldView.technologyLevel = obj as unknown as TechnologyLevel;
      else if (node.type === 'world.history') project.worldView.history = obj as unknown as WorldHistory;
    } else {
      // 未知（插件扩展）类型：按 node.type 归入 extensions，核心不解释其结构
      const bag = (project.extensions ??= {});
      (bag[node.type] ??= []).push(nodeToObj(node, 'title', 'body'));
    }
  }

  return project;
}
