/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 参考文献与脚注（docs/design/41 §1、§2、§5）。
 *
 * 来源条目落在通用类型模板 meta.reference 上：结构化字段存属性，citekey 为正文引用键。
 * 本模块是纯函数集合，负责：
 *   - 从节点/属性收集来源（collectReferenceSources）；
 *   - 按引用样式产出文中标记与文末条目（CITATION_STYLES / formatBibliography）；
 *   - 按正文出现顺序编号、重复引用复用编号、失链标记（createInlineReferences / resolveInlineReferences）；
 *   - 双向关联与失链报告（buildCitationUsage）；
 *   - 新建来源节点（referenceEntities）。
 * 不引入第二份真相：正文只写 citekey，来源数据仍由节点承载。
 */
import type { CitationItem } from '../dsl/citation';
import { formatCitation, parseCitations, parseFootnotes } from '../dsl/citation';
import type { AttributeEntity,NodeEntity } from '../entities';

/** 来源类型：书/论文/网页等。 */
export type ReferenceType = 'book' | 'article' | 'chapter' | 'thesis' | 'web' | 'other';

/** 来源条目字段名，与类型模板 meta.reference 一致。 */
export const REFERENCE_FIELDS = [
  'citekey',
  'type',
  'authors',
  'year',
  'container',
  'publisher',
  'place',
  'volume',
  'issue',
  'pages',
  'url',
  'doi',
  'isbn',
  'accessed',
  'note',
] as const;

export type ReferenceField = (typeof REFERENCE_FIELDS)[number];

/** 结构化的来源条目（节点投影后的领域视图）。 */
export interface ReferenceSource {
  /** 节点 id。 */
  id: string;
  /** 正文引用键（[@key]）；缺省回落节点 id。 */
  citekey: string;
  title: string;
  type: ReferenceType;
  authors?: string;
  year?: string;
  container?: string;
  publisher?: string;
  place?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  doi?: string;
  isbn?: string;
  accessed?: string;
  note?: string;
}

/** 供新建投影使用的输入（Project.references 的元素）。 */
export interface ReferenceInput {
  id: string;
  citekey?: string;
  title?: string;
  type?: string;
  authors?: string;
  year?: string;
  container?: string;
  publisher?: string;
  place?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  doi?: string;
  isbn?: string;
  accessed?: string;
  note?: string;
}

const REFERENCE_TYPES: readonly ReferenceType[] = ['book', 'article', 'chapter', 'thesis', 'web', 'other'];

function asReferenceType(value: string | undefined): ReferenceType {
  return (REFERENCE_TYPES as readonly string[]).includes(value ?? '') ? (value as ReferenceType) : 'other';
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') return value.trim();
  }
  return undefined;
}

/**
 * 从六实体收集来源：type='meta.reference' 的节点，字段取属性、标题取 node.title。
 * 同一 citekey 重复时保留字段更完整的一条（去重口径见 dedupeSources）。
 */
export function collectReferenceSources(
  nodes: readonly NodeEntity[],
  attrs: readonly AttributeEntity[] = [],
): Map<string, ReferenceSource> {
  const attrsByNode = new Map<string, Map<string, string>>();
  for (const attr of attrs) {
    if (attr.erased) continue;
    const bag = attrsByNode.get(attr.nodeId) ?? new Map<string, string>();
    bag.set(attr.name, attr.value);
    attrsByNode.set(attr.nodeId, bag);
  }

  const byKey = new Map<string, ReferenceSource>();
  for (const node of nodes) {
    if (node.erased || node.type !== 'meta.reference') continue;
    const bag = attrsByNode.get(node.id);
    const citekey = firstNonEmpty(bag?.get('citekey'), node.id) ?? node.id;
    const source: ReferenceSource = {
      id: node.id,
      citekey,
      title: firstNonEmpty(node.title) ?? citekey,
      type: asReferenceType(bag?.get('type')),
      authors: firstNonEmpty(bag?.get('authors')),
      year: firstNonEmpty(bag?.get('year')),
      container: firstNonEmpty(bag?.get('container')),
      publisher: firstNonEmpty(bag?.get('publisher')),
      place: firstNonEmpty(bag?.get('place')),
      volume: firstNonEmpty(bag?.get('volume')),
      issue: firstNonEmpty(bag?.get('issue')),
      pages: firstNonEmpty(bag?.get('pages')),
      url: firstNonEmpty(bag?.get('url')),
      doi: firstNonEmpty(bag?.get('doi')),
      isbn: firstNonEmpty(bag?.get('isbn')),
      accessed: firstNonEmpty(bag?.get('accessed')),
      note: firstNonEmpty(bag?.get('note')),
    };
    const existing = byKey.get(citekey);
    if (!existing) byKey.set(citekey, source);
    else byKey.set(citekey, moreComplete(existing, source));
  }
  return byKey;
}

/** 字段计数：用于重复 citekey 去重时保留更完整的一条。 */
function fieldCount(source: ReferenceSource): number {
  let count = 0;
  for (const field of REFERENCE_FIELDS) {
    const value = source[field];
    if (typeof value === 'string' && value.trim() !== '') count++;
  }
  return count;
}

function moreComplete(a: ReferenceSource, b: ReferenceSource): ReferenceSource {
  return fieldCount(b) > fieldCount(a) ? b : a;
}

// ── 引用样式（数据化，便于扩充；docs/design/41 §5） ─────────────────

export interface CitationStyle {
  id: string;
  label: string;
  labelEn: string;
  /** 文中标记；number 为引用序号（1 起）。 */
  inline(source: ReferenceSource, number: number): string;
  /** 文末条目。 */
  entry(source: ReferenceSource, number: number): string;
  /** 文末排序：citation 按引用序；author 按作者与年份。 */
  order: 'citation' | 'author';
}

const TYPE_TAG: Record<ReferenceType, string> = {
  book: '[M]',
  article: '[J]',
  chapter: '[M]',
  thesis: '[D]',
  web: '[EB/OL]',
  other: '[Z]',
};

function dot(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return /[.。!?！？]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function joinDot(parts: Array<string | undefined>): string {
  return parts
    .map((part) => (part ? part.trim() : ''))
    .filter((part) => part !== '')
    .map((part) => dot(part))
    .join(' ')
    .trim();
}

/** 出版项：`出版地: 出版社`，缺一则只留另一项。 */
function publication(source: ReferenceSource): string {
  return [source.place, source.publisher].filter((part): part is string => Boolean(part)).join(': ');
}

/** 卷期页：`年, 卷(期): 页`。 */
function serial(source: ReferenceSource): string {
  const volume = source.volume ? source.issue ? `${source.volume}(${source.issue})` : source.volume : source.issue ?? '';
  const parts: string[] = [];
  if (source.year) parts.push(source.year);
  if (volume) parts.push(volume);
  let out = parts.join(', ');
  if (source.pages) out = out ? `${out}: ${source.pages}` : source.pages;
  return out;
}

const numberedStyle: CitationStyle = {
  id: 'numbered',
  label: '编号（GB/T 7714 风格）',
  labelEn: 'Numbered (GB/T 7714 style)',
  order: 'citation',
  inline: (_source, number) => `[${number}]`,
  entry: (source, number) => {
    const tag = dot(source.title) + TYPE_TAG[source.type];
    let body: string;
    if (source.type === 'article') {
      body = joinDot([source.authors, tag, source.container, serial(source)]);
    } else if (source.type === 'web') {
      const accessed = source.accessed ? `[${source.accessed}]` : '';
      body = joinDot([source.authors, `${tag}${accessed}`, source.year, source.url]);
    } else if (source.type === 'chapter') {
      const inContainer = source.container ? `//${source.container}` : '';
      body = joinDot([source.authors, tag + inContainer, publication(source), serial(source)]);
    } else if (source.type === 'thesis') {
      body = joinDot([source.authors, tag, publication(source), source.year]);
    } else {
      body = joinDot([source.authors, tag, publication(source), source.year]);
    }
    return `[${number}] ${body}`.trim();
  },
};

const authorDateStyle: CitationStyle = {
  id: 'author-date',
  label: '作者-年份（APA 风格）',
  labelEn: 'Author-date (APA style)',
  order: 'author',
  inline: (source) => `(${source.authors ?? source.title}, ${source.year ?? 'n.d.'})`,
  entry: (source) => joinDot([source.authors, source.year ? `(${source.year})` : undefined, source.title, publication(source), source.url]),
};

export const CITATION_STYLES: readonly CitationStyle[] = [numberedStyle, authorDateStyle];

/** 取样式，未注册回落编号样式（缺省口径稳定）。 */
export function getCitationStyle(id: string | undefined): CitationStyle {
  return CITATION_STYLES.find((style) => style.id === id) ?? numberedStyle;
}

/**
 * 生成文末参考文献表：按引用顺序取来源，author 样式再按作者/年份稳定排序。
 * 入参只含已知 citekey；失链在正文以标记呈现、不进文献表。
 */
export function formatBibliography(
  order: readonly string[],
  sources: ReadonlyMap<string, ReferenceSource>,
  styleId: string | undefined,
): string[] {
  const style = getCitationStyle(styleId);
  const keys = [...order];
  if (style.order === 'author') {
    keys.sort((a, b) => {
      const sa = sources.get(a);
      const sb = sources.get(b);
      return (sa?.authors ?? sa?.title ?? a).localeCompare(sb?.authors ?? sb?.title ?? b, 'zh') || (sa?.year ?? '').localeCompare(sb?.year ?? '');
    });
  }
  return keys.map((key, index) => {
    const source = sources.get(key);
    return source ? style.entry(source, index + 1) : `[${index + 1}] 【失链：${key}】`;
  });
}

// ── 正文解析：编号、失链、脚注 ───────────────────────────────────────

export interface InlineReferences {
  sources: ReadonlyMap<string, ReferenceSource>;
  styleId: string;
  format: string;
  /** citekey → 引用序号（1 起）。 */
  numbers: Map<string, number>;
  /** 引用出现顺序（去重后的 citekey 列表）。 */
  order: string[];
  /** 脚注文本，顺序即编号。 */
  footnotes: string[];
  /** 失链的 citekey（去重）。 */
  broken: string[];
}

export function createInlineReferences(
  sources: ReadonlyMap<string, ReferenceSource>,
  styleId: string,
  format: string,
): InlineReferences {
  return { sources, styleId, format, numbers: new Map(), order: [], footnotes: [], broken: [] };
}

/**
 * 脚注序号标记：md 用脚注引用语法（文末落 `[^n]: …`），其余格式回落 [n]。
 * 标记一律为纯文本，渲染器按各自口径转义，避免标签被二次转义。
 */
export function footnoteMarker(number: number, format: string): string {
  if (format === 'md') return `[^${number}]`;
  return `[${number}]`;
}

function citationMarker(style: CitationStyle, source: ReferenceSource, number: number): string {
  return style.inline(source, number);
}

/**
 * 就地解析一段文本的脚注与引文：脚注抽取为文末注，引文替换为文中标记并登记编号，
 * 来源缺失写失链标记。编号按首次出现顺序分配，重复引用复用同一编号。
 */
export function resolveInlineReferences(text: string, state: InlineReferences): string {
  const style = getCitationStyle(state.styleId);
  const withFootnotes = text.includes('^[')
    ? text.replace(/\^\[([^\]\n]*)\]/g, (match, content: string, offset: number) => {
        if (isEscapedAt(text, offset)) return match;
        state.footnotes.push(content);
        return footnoteMarker(state.footnotes.length, state.format);
      })
    : text;

  if (!withFootnotes.includes('[@')) return withFootnotes;
  return withFootnotes.replace(/\[(?:@[A-Za-z0-9_.:-]+(?:\|[^\];]*)?)(?:\s*;\s*@[A-Za-z0-9_.:-]+(?:\|[^\];]*)?)*\]/g, (match) => {
    const hits = parseCitations(match);
    const items = hits[0]?.items ?? [];
    if (items.length === 0) return match;
    return items.map((item) => renderCitation(item, style, state)).join('; ');
  });
}

function renderCitation(item: CitationItem, style: CitationStyle, state: InlineReferences): string {
  const source = state.sources.get(item.key);
  if (!source) {
    if (!state.broken.includes(item.key)) state.broken.push(item.key);
    return `【失链：${item.key}】`;
  }
  let number = state.numbers.get(item.key);
  if (number === undefined) {
    number = state.order.length + 1;
    state.numbers.set(item.key, number);
    state.order.push(item.key);
  }
  const marker = citationMarker(style, source, number);
  return item.locator ? `${marker}, ${item.locator}` : marker;
}

function isEscapedAt(text: string, start: number): boolean {
  let backslashes = 0;
  for (let i = start - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 1;
}

// ── 双向关联与失链报告 ───────────────────────────────────────────────

export interface CitationOccurrence {
  citekey: string;
  nodeId: string;
  nodeTitle: string;
  /** 行号，1 起。 */
  line: number;
  locator?: string;
}

export interface CitationUsage {
  /** citekey → 引用它的节点 id（去重，保持出现顺序）。 */
  byKey: Map<string, string[]>;
  /** 正文引用但来源缺失的命中。 */
  broken: CitationOccurrence[];
  /** 全部命中（含重复引用）。 */
  occurrences: CitationOccurrence[];
}

/** 扫描正文，产出「来源 → 章节」反向关联与失链清单（docs/design/41 §1）。 */
export function buildCitationUsage(
  nodes: readonly NodeEntity[],
  sources: ReadonlyMap<string, ReferenceSource>,
): CitationUsage {
  const byKey = new Map<string, string[]>();
  const broken: CitationOccurrence[] = [];
  const occurrences: CitationOccurrence[] = [];
  for (const node of nodes) {
    if (node.erased || node.type === 'meta.reference') continue;
    const lines = node.body.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const hit of parseCitations(lines[i] ?? '')) {
        for (const item of hit.items) {
          const occurrence: CitationOccurrence = { citekey: item.key, nodeId: node.id, nodeTitle: node.title, line: i + 1 };
          if (item.locator) occurrence.locator = item.locator;
          occurrences.push(occurrence);
          const owners = byKey.get(item.key) ?? [];
          if (!owners.includes(node.id)) owners.push(node.id);
          byKey.set(item.key, owners);
          if (!sources.has(item.key)) broken.push(occurrence);
        }
      }
    }
  }
  return { byKey, broken, occurrences };
}

// ── 节点构造：Project.references → 六实体 ───────────────────────────

/** 把来源条目投影为 meta.reference 节点与属性（导出与反向投影共用）。 */
export function referenceEntities(
  references: readonly ReferenceInput[],
  bookId: string,
): { nodes: NodeEntity[]; attrs: AttributeEntity[] } {
  const nodes: NodeEntity[] = [];
  const attrs: AttributeEntity[] = [];
  references.forEach((reference, index) => {
    const id = reference.id;
    const citekey = firstNonEmpty(reference.citekey, id) ?? id;
    const title = firstNonEmpty(reference.title, citekey) ?? citekey;
    nodes.push({
      id,
      bookId,
      type: 'meta.reference',
      title,
      body: '',
      createdAt: 0,
      updatedAt: 0,
      erased: false,
    });
    const values: Array<[string, string | undefined]> = [
      ['citekey', citekey],
      ['type', asReferenceType(reference.type)],
      ['authors', reference.authors],
      ['year', reference.year],
      ['container', reference.container],
      ['publisher', reference.publisher],
      ['place', reference.place],
      ['volume', reference.volume],
      ['issue', reference.issue],
      ['pages', reference.pages],
      ['url', reference.url],
      ['doi', reference.doi],
      ['isbn', reference.isbn],
      ['accessed', reference.accessed],
      ['note', reference.note],
    ];
    let position = index;
    for (const [name, value] of values) {
      if (value === undefined || value.trim() === '') continue;
      attrs.push({
        id: `a:${id}:${name}`,
        nodeId: id,
        type: 'label',
        name,
        value,
        inheritable: false,
        position: position++,
        erased: false,
      });
    }
  });
  return { nodes, attrs };
}

/** 重新导出引文语法构造器，便于调用方从单一出口引用。 */
export { formatCitation, parseCitations, parseFootnotes };
