/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { parseKeywords } from '../dsl/keywords';
import type { AttributeEntity, BookEntities, NodeEntity } from '../entities/types';
import { countWords } from './words';

/**
 * 索引器（docs/design/03 §4）—— 纯函数 + 内存服务。
 * 公理 1：索引是缓存，删了可全量重建；一致性/伏笔/图谱/Build 全部只消费快照。
 */

export interface TagEntry {
  nodeId: string;
  displayName: string;
  aliases: string[];
  /** 来源模板的 tagKind（'character' | 'location' …），隐式标题标签为 'implicit' */
  kind: string;
}

export interface RefEntry {
  nodeId: string;
  role: string;
  keyword: string;
  /** 原始目标文本（标签或别名） */
  target: string;
  /** 解析到的节点 id；未命中 = undefined（索引器负责完整性报告） */
  resolvedNodeId?: string;
}

export interface StrandStat {
  strandTag: string;
  sceneCount: number;
  wordCount: number;
  lastAdvancedAt?: number;
}

export interface ForeshadowStat {
  nodeId: string;
  title: string;
  importance: string;
  plantedChapterOrder?: number;
  /** 距埋设已过多少章未回收 */
  ageChapters?: number;
  overdue: boolean;
}

/** 伏笔超期阈值：埋设后超过 N 章未回收视为超期 */
export const FORESHADOW_OVERDUE_CHAPTERS = 10;

export interface IndexSnapshot {
  bookId: string;
  /** 规范化标签 → 声明条目（含别名解析后的主标签） */
  tags: Map<string, TagEntry>;
  /** 标签 → 引用它的条目（软引用，不联动） */
  refs: Map<string, RefEntry[]>;
  /** nodeId → 出链目标 nodeId（wiki 硬链接，已解析） */
  hardLinks: Map<string, string[]>;
  /** nodeId → 被哪些节点引用（refs + hardLinks 的反向，去重源 id） */
  backlinks: Map<string, string[]>;
  /** nodeId → 正文字数（CJK 感知） */
  wordCounts: Map<string, number>;
  strandProgress: Map<string, StrandStat>;
  foreshadowOpen: ForeshadowStat[];
  /** 未解析引用清单（完整性报告，编辑器波浪线/检查面板消费） */
  unresolved: RefEntry[];
  builtAt: number;
  revision: number;
}

function getAttr(attrs: Map<string, AttributeEntity[]>, nodeId: string, name: string): AttributeEntity | undefined {
  return attrs.get(nodeId)?.find((a) => a.name === name && !a.erased);
}

function addBacklink(map: Map<string, string[]>, targetId: string, sourceId: string): void {
  const list = map.get(targetId);
  if (list) {
    if (!list.includes(sourceId)) list.push(sourceId);
  } else {
    map.set(targetId, [sourceId]);
  }
}

/** 章节排序值：order 属性优先，退化为 contain 边 position */
function chapterOrder(node: NodeEntity, attrs: Map<string, AttributeEntity[]>, positionByNode: Map<string, number>): number {
  const a = getAttr(attrs, node.id, 'order');
  if (a) {
    const n = Number(a.value);
    if (Number.isFinite(n)) return n;
  }
  return positionByNode.get(node.id) ?? 0;
}

/**
 * 全量构建一本书的索引。纯函数：同一输入必得同一快照（除 builtAt）。
 * 书级规模（数百节点）下全量重建 < 10ms，增量接口留给文件监听场景。
 */
export function buildIndex(entities: BookEntities): IndexSnapshot {
  const nodes = entities.nodes.filter((n) => !n.erased);
  const edges = entities.edges.filter((e) => !e.erased);
  const attrs = new Map<string, AttributeEntity[]>();
  for (const a of entities.attrs) {
    if (a.erased) continue;
    const list = attrs.get(a.nodeId);
    if (list) list.push(a);
    else attrs.set(a.nodeId, [a]);
  }

  const positionByNode = new Map<string, number>();
  for (const e of edges) {
    if (e.kind === 'contain') positionByNode.set(e.toId, e.position);
  }

  const tags = new Map<string, TagEntry>();
  const aliasToPrimary = new Map<string, string>();
  const refs = new Map<string, RefEntry[]>();
  const hardLinks = new Map<string, string[]>();
  const backlinks = new Map<string, string[]>();
  const wordCounts = new Map<string, number>();
  const unresolved: RefEntry[] = [];

  const addTag = (tag: string, entry: TagEntry) => {
    const key = tag.trim();
    if (!key) return;
    if (!tags.has(key)) tags.set(key, entry);
  };

  /** 是否素材：material 属性为 'true'（缺失/非真即非素材）。字数口径据此剔除。 */
  const isMaterial = (nodeId: string): boolean =>
    getAttr(attrs, nodeId, 'material')?.value === 'true';

  // 第一遍：声明标签（@tag: 主名 | 别名）+ 卡片标题隐式标签
  for (const node of nodes) {
    const parsed = parseKeywords(node.body);
    const kind = node.type.startsWith('card.') ? node.type.slice('card.'.length) : node.type;
    for (const decl of parsed.declarations) {
      addTag(decl.tag, { nodeId: node.id, displayName: decl.tag, aliases: decl.aliases, kind });
      for (const alias of decl.aliases) {
        if (!aliasToPrimary.has(alias)) aliasToPrimary.set(alias, decl.tag);
      }
    }
    if (node.type.startsWith('card.') || node.type === 'meta.timeline-event') {
      addTag(node.title, { nodeId: node.id, displayName: node.title, aliases: [], kind: 'implicit' });
    }
    wordCounts.set(node.id, isMaterial(node.id) ? 0 : countWords(node.body));
  }

  const resolveTag = (target: string): TagEntry | undefined => {
    const t = target.trim();
    const primary = aliasToPrimary.get(t);
    return tags.get(t) ?? (primary ? tags.get(primary) : undefined);
  };

  // 第二遍：引用与硬链接
  const strandTargets = new Map<string, string[]>();
  for (const node of nodes) {
    const parsed = parseKeywords(node.body);
    for (const ref of parsed.references) {
      if (ref.role === 'strand') {
        const cur = strandTargets.get(node.id);
        if (cur) cur.push(...ref.targets);
        else strandTargets.set(node.id, [...ref.targets]);
      }
      for (const target of ref.targets) {
        const entry: RefEntry = { nodeId: node.id, role: ref.role, keyword: ref.keyword, target };
        const hit = resolveTag(target);
        if (hit) {
          entry.resolvedNodeId = hit.nodeId;
          const list = refs.get(hit.displayName);
          if (list) list.push(entry);
          else refs.set(hit.displayName, [entry]);
          addBacklink(backlinks, hit.nodeId, node.id);
        } else {
          unresolved.push(entry);
        }
      }
    }
    for (const link of parsed.wikiLinks) {
      const hit = resolveTag(link.tag);
      if (hit) {
        const list = hardLinks.get(node.id);
        if (list) list.push(hit.nodeId);
        else hardLinks.set(node.id, [hit.nodeId]);
        addBacklink(backlinks, hit.nodeId, node.id);
      } else {
        unresolved.push({ nodeId: node.id, role: 'link-hard', keyword: 'wiki', target: link.tag });
      }
    }
  }

  // 叙事线进度：scene/chapter 的 strand 属性或 @strand 引用（未解析也计入，按目标文本聚合）
  const strandProgress = new Map<string, StrandStat>();
  for (const node of nodes) {
    if (node.type !== 'novel.scene' && node.type !== 'novel.chapter') continue;
    if (isMaterial(node.id)) continue;
    const strandTags: string[] = [];
    const attr = getAttr(attrs, node.id, 'strand');
    if (attr) strandTags.push(attr.value);
    strandTags.push(...(strandTargets.get(node.id) ?? []));
    for (const tag of strandTags) {
      const stat = strandProgress.get(tag) ?? { strandTag: tag, sceneCount: 0, wordCount: 0 };
      stat.sceneCount += 1;
      stat.wordCount += wordCounts.get(node.id) ?? 0;
      stat.lastAdvancedAt = Math.max(stat.lastAdvancedAt ?? 0, node.updatedAt);
      strandProgress.set(tag, stat);
    }
  }

  // 伏笔：planted 未回收 + 超期
  const chapterNodes = nodes.filter((n) => n.type === 'novel.chapter');
  const maxChapterOrder = chapterNodes.reduce(
    (max, n) => Math.max(max, chapterOrder(n, attrs, positionByNode)),
    0
  );
  const foreshadowOpen: ForeshadowStat[] = [];
  for (const node of nodes) {
    if (node.type !== 'meta.foreshadow') continue;
    const status = getAttr(attrs, node.id, 'status')?.value ?? 'planted';
    if (status !== 'planted') continue;
    const plantedOrderAttr = getAttr(attrs, node.id, 'plantedChapterOrder');
    const plantedChapterOrder = plantedOrderAttr ? Number(plantedOrderAttr.value) : undefined;
    const ageChapters =
      plantedChapterOrder !== undefined && Number.isFinite(plantedChapterOrder)
        ? Math.max(0, maxChapterOrder - plantedChapterOrder)
        : undefined;
    foreshadowOpen.push({
      nodeId: node.id,
      title: node.title,
      importance: getAttr(attrs, node.id, 'importance')?.value ?? 'minor',
      plantedChapterOrder: Number.isFinite(plantedChapterOrder as number) ? plantedChapterOrder : undefined,
      ageChapters,
      overdue: ageChapters !== undefined && ageChapters >= FORESHADOW_OVERDUE_CHAPTERS,
    });
  }

  return {
    bookId: nodes[0]?.bookId ?? '',
    tags,
    refs,
    hardLinks,
    backlinks,
    wordCounts,
    strandProgress,
    foreshadowOpen,
    unresolved,
    builtAt: Date.now(),
    revision: 1,
  };
}

/** FNV-1a 单遍折叠：把字符串逐字符混入 32-bit 哈希累加器 */
function fold(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 计算实体集合的内容指纹：覆盖所有影响索引结果的字段（含节点正文 body，
 * 保证正文改动必然改变指纹，杜绝陈旧索引）。单遍 O(总字符)，远轻于
 * parse+countWords+图装配的全量重建，用于 rebuild 的「无变化即复用」短路。
 */
export function fingerprintEntities(entities: BookEntities): string {
  let h = 0x811c9dc5;
  for (const n of entities.nodes) {
    h = fold(h, `n${n.id}\u001f${n.type}\u001f${n.title}\u001f${n.body}\u001f${n.path ?? ''}\u001f${n.erased}`);
  }
  for (const e of entities.edges) {
    h = fold(h, `e${e.id}\u001f${e.fromId}\u001f${e.toId}\u001f${e.kind}\u001f${e.role ?? ''}\u001f${e.position}\u001f${e.erased}`);
  }
  for (const a of entities.attrs) {
    h = fold(h, `a${a.id}\u001f${a.nodeId}\u001f${a.name}\u001f${a.value}\u001f${a.erased}`);
  }
  return h.toString(16);
}

/** 可 JSON 序列化的索引快照形态（Map → 条目数组），用于 IPC 传输与测试 */
export interface SerializedIndexSnapshot {
  bookId: string;
  tags: [string, TagEntry][];
  refs: [string, RefEntry[]][];
  hardLinks: [string, string[]][];
  backlinks: [string, string[]][];
  wordCounts: [string, number][];
  strandProgress: [string, StrandStat][];
  foreshadowOpen: ForeshadowStat[];
  unresolved: RefEntry[];
  builtAt: number;
  revision: number;
}

export function serializeIndexSnapshot(s: IndexSnapshot): SerializedIndexSnapshot {
  return {
    bookId: s.bookId,
    tags: [...s.tags],
    refs: [...s.refs],
    hardLinks: [...s.hardLinks],
    backlinks: [...s.backlinks],
    wordCounts: [...s.wordCounts],
    strandProgress: [...s.strandProgress],
    foreshadowOpen: s.foreshadowOpen,
    unresolved: s.unresolved,
    builtAt: s.builtAt,
    revision: s.revision,
  };
}

export function deserializeIndexSnapshot(d: SerializedIndexSnapshot): IndexSnapshot {
  return {
    bookId: d.bookId,
    tags: new Map(d.tags),
    refs: new Map(d.refs),
    hardLinks: new Map(d.hardLinks),
    backlinks: new Map(d.backlinks),
    wordCounts: new Map(d.wordCounts),
    strandProgress: new Map(d.strandProgress),
    foreshadowOpen: d.foreshadowOpen,
    unresolved: d.unresolved,
    builtAt: d.builtAt,
    revision: d.revision,
  };
}

/**
 * 索引服务：按书缓存快照。Repository 在实体写入后调用 rebuild（书级全量，
 * 书规模下足够快）；消费方（一致性/伏笔/图谱/Build）只读 snapshot()。
 *
 * 增量策略：rebuild 计算输入实体的内容指纹，指纹与上次一致时直接复用缓存快照，
 * 跳过全量重算（应对「保存但内容未变」等无变化写入）。索引本身不落盘——
 * 它是实体（SQLite 持久化）的派生缓存，冷启动由 loadAll 重建，避免缓存失效问题。
 */
export class IndexService {
  private readonly snapshots = new Map<string, IndexSnapshot>();
  private readonly fingerprints = new Map<string, string>();
  private revision = 0;

  /**
   * 重建某书索引。若输入实体指纹与缓存一致，返回缓存快照（不重算）。
   * @param force 忽略指纹，强制重算
   */
  rebuild(bookId: string, entities: BookEntities, force = false): IndexSnapshot {
    const fp = fingerprintEntities(entities);
    if (!force && this.fingerprints.get(bookId) === fp) {
      const cached = this.snapshots.get(bookId);
      if (cached) return cached;
    }
    const snapshot = buildIndex(entities);
    snapshot.bookId = bookId;
    snapshot.revision = ++this.revision;
    this.snapshots.set(bookId, snapshot);
    this.fingerprints.set(bookId, fp);
    return snapshot;
  }

  get(bookId: string): IndexSnapshot | undefined {
    return this.snapshots.get(bookId);
  }

  /** 取快照；未建则返回 null（调用方触发 rebuild） */
  snapshot(bookId: string): IndexSnapshot | null {
    return this.snapshots.get(bookId) ?? null;
  }

  invalidate(bookId: string): void {
    this.snapshots.delete(bookId);
    this.fingerprints.delete(bookId);
  }

  clear(): void {
    this.snapshots.clear();
    this.fingerprints.clear();
  }
}

/** 进程级默认索引服务（Repository 与 UI 共享同一实例） */
export const indexService = new IndexService();
