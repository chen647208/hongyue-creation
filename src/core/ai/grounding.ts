/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 可信检索的出处与逐字校验（docs/design/37 §4）：把检索命中规范化为带出处的引用，
 * 空结果给出明确措辞（不得据此编造），引用文本与原文做逐字比对。
 * 纯函数，零依赖；渲染端与主进程共用。
 */

/** 被引用的来源种类：章节正文或知识库条目（与 repository.SearchHit.scope 对齐）。 */
export type CitationSourceKind = 'chapter' | 'knowledge';

/** 一条带出处的引用。 */
export interface Citation {
  /** 稳定标识：`<sourceKind>:<refId>`，用于去重与 UI key。 */
  id: string;
  sourceKind: CitationSourceKind;
  /** 章节 id 或知识条目 id。 */
  refId: string;
  title: string;
  /** 命中片段（可能带高亮标记）。 */
  snippet: string;
  /** 相关度序（越小越靠前）。 */
  rank: number;
  /** 该来源是否标记为素材。 */
  material?: boolean;
  /** 点跳锚点：`<sourceKind>:<refId>`。 */
  anchor: string;
}

/** 检索命中的宽松输入形态（FTS 命中或语义命中都归一到这里）。 */
export interface CitationHitLike {
  scope?: string;
  projectId?: string;
  id?: string;
  title?: string;
  snippet?: string;
  rank?: number;
  material?: boolean;
  name?: string;
  category?: string;
  score?: number;
  content?: string;
}

/** 一次检索的结论：命中清单与给模型/界面看的文本。 */
export interface RetrievalOutcome {
  query: string;
  found: boolean;
  citations: Citation[];
  text: string;
}

/** 单条命中规范化为引用；缺 id/名称或无片段时返回 null（不占位）。 */
export function toCitation(hit: CitationHitLike): Citation | null {
  const refId = typeof hit.id === 'string' && hit.id ? hit.id : typeof hit.name === 'string' ? hit.name : '';
  if (!refId) return null;
  const snippet = (hit.snippet ?? hit.content ?? '').trim();
  if (!snippet) return null;
  const sourceKind: CitationSourceKind = hit.scope === 'chapter' ? 'chapter' : 'knowledge';
  const title = (hit.title ?? hit.name ?? refId).trim() || refId;
  const rank = typeof hit.rank === 'number'
    ? hit.rank
    : typeof hit.score === 'number'
      ? 1 - hit.score
      : 0;
  return {
    id: `${sourceKind}:${refId}`,
    sourceKind,
    refId,
    title,
    snippet,
    rank,
    material: hit.material,
    anchor: `${sourceKind}:${refId}`,
  };
}

/** 批量规范化并按相关度稳定排序、按 id 去重。 */
export function buildCitations(hits: readonly CitationHitLike[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const hit of hits) {
    const citation = toCitation(hit);
    if (!citation || seen.has(citation.id)) continue;
    seen.add(citation.id);
    out.push(citation);
  }
  return out
    .map((citation, index) => ({ citation, index }))
    .sort((a, b) => a.citation.rank - b.citation.rank || a.index - b.index)
    .map((entry) => entry.citation);
}

/**
 * 空结果措辞：明确说明未找到，禁止据此编造。query 为空时退化为范围说明。
 */
export function formatNoRetrieval(query: string): string {
  const q = query.trim();
  const scope = '已检索章节正文与知识库索引';
  return q
    ? `未找到与「${q}」相关的资料：${scope}，没有命中。不要据此编造内容；可换关键词重试，或直接说明缺少该资料。`
    : `未检索到资料：${scope}，没有命中。不要据此编造内容。`;
}

/** 渲染命中清单文本（带出处），供工具结果与注入段落复用。 */
export function renderCitations(query: string, citations: readonly Citation[]): string {
  const lines = citations.map((citation, index) => {
    const kind = citation.sourceKind === 'chapter' ? '章节' : '知识库';
    return `[${index + 1}] ${kind}《${citation.title}》出处 ${citation.anchor}：${citation.snippet}`;
  });
  return `找到 ${citations.length} 条与「${query.trim()}」相关的资料（引用须忠于原文，出处可点跳）：\n${lines.join('\n')}`;
}

/** 规范化检索结论：命中即带出处清单，未命中即明确措辞。 */
export function describeRetrieval(query: string, hits: readonly CitationHitLike[]): RetrievalOutcome {
  const citations = buildCitations(hits);
  if (!citations.length) {
    return { query, found: false, citations, text: formatNoRetrieval(query) };
  }
  return { query, found: true, citations, text: renderCitations(query, citations) };
}

/** FTS5 snippet 的高亮括号标记（见 shared/sql/catalog.ts 的 snippet(..., '[', ']', ...)）。 */
const SNIPPET_HIGHLIGHT = /[[\]]/g;

/** 去掉检索片段的高亮标记，得到可逐字比对的原文字面。 */
export function stripSnippetMarkers(snippet: string): string {
  return snippet.replace(SNIPPET_HIGHLIGHT, '');
}

/**
 * 逐字校验：引用片段必须是原文的连续子串（含空白与标点）。
 * 检索片段可能用省略号拼接不连续窗口：按省略号切分后，每一段都须在原文中连续出现。
 * 空引用视为未命中。
 */
export function quoteAppearsExactly(quote: string, original: string): boolean {
  if (!quote || !original) return false;
  const segments = quote
    .split(/…|\.\.\./)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every((segment) => original.includes(segment));
}
