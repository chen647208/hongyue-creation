/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * JSON Canvas（jsoncanvas.org 1.0，Obsidian 等工具通用）开放格式的解析、校验与序列化。
 *
 * 只认开放格式：节点用 `id/type/x/y/width/height` 基础字段，文本、文件、链接、分组各有
 * 必填字段，边用 `fromNode/toNode` 与可选端点。规范未定义的额外字段原样保留，便于与外部
 * 工具互通与向前扩展。非法结构给出可读原因：整个文档不可解析时拒绝；单节点/单边非法时
 * 丢弃该条并记录，能降级的降级。本模块为纯函数，不触碰渲染与存储。
 */
import { CANVAS_MAX_EDGES, CANVAS_MAX_NODES } from '@shared/constants/views';

/** JSON Canvas 的节点类型。 */
export type CanvasNodeType = 'text' | 'file' | 'link' | 'group';

/** 连线端点方位。 */
export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';

/** 连线端点箭头形态。 */
export type CanvasEnd = 'none' | 'arrow';

/** 分组节点的背景填充方式。 */
export type CanvasBackgroundStyle = 'cover' | 'ratio' | 'repeat';

/** JSON Canvas 节点（已知字段 + 任意规范外扩展字段）。 */
export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 预设色号 `1`–`6` 或十六进制色值。 */
  color?: string;
  /** 文本节点正文（Markdown）。 */
  text?: string;
  /** 文件节点路径。 */
  file?: string;
  /** 文件节点子路径（Markdown 标题锚点）。 */
  subpath?: string;
  /** 链接节点 URL。 */
  url?: string;
  /** 分组节点标签。 */
  label?: string;
  /** 分组节点背景路径。 */
  background?: string;
  backgroundStyle?: CanvasBackgroundStyle;
  /** 投影扩展：来源行类型（实体/章节等），非规范字段。 */
  kind?: string;
  [key: string]: unknown;
}

/** JSON Canvas 边（已知字段 + 任意规范外扩展字段）。 */
export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toEnd?: CanvasEnd;
  color?: string;
  label?: string;
  [key: string]: unknown;
}

/** 一份 JSON Canvas 文档。 */
export interface CanvasDocument {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** 单条校验记录：出问题的位置与可读原因。 */
export interface CanvasValidationIssue {
  /** 位置，如 `nodes[2]`、`edges[0]`、`document`。 */
  path: string;
  /** 可读原因（中性英文，供日志与测试；面向用户的提示由调用方包装）。 */
  message: string;
}

/** 解析结果：根结构非法即失败；单条非法仅记录，文档其余部分仍可用。 */
export type CanvasParseResult =
  | { ok: true; document: CanvasDocument; issues: CanvasValidationIssue[] }
  | { ok: false; issues: CanvasValidationIssue[] };

const NODE_TYPES: readonly CanvasNodeType[] = ['text', 'file', 'link', 'group'];
const SIDES: readonly CanvasSide[] = ['top', 'right', 'bottom', 'left'];
const ENDS: readonly CanvasEnd[] = ['none', 'arrow'];
const BACKGROUND_STYLES: readonly CanvasBackgroundStyle[] = ['cover', 'ratio', 'repeat'];

const NODE_KEYS = ['id', 'type', 'x', 'y', 'width', 'height', 'text', 'file', 'subpath', 'url', 'label', 'background', 'backgroundStyle', 'color'] as const;
const EDGE_KEYS = ['id', 'fromNode', 'toNode', 'fromSide', 'toSide', 'fromEnd', 'toEnd', 'color', 'label'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

function isCanvasColor(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false;
  return /^[1-6]$/.test(value) || isHexColor(value);
}

/** 可选规范化：值合法则写入，非法则从节点/边上删除并记录。 */
function applyOptionalString(target: Record<string, unknown>, key: string, path: string, issues: CanvasValidationIssue[]): void {
  const value = target[key];
  if (value === undefined) return;
  if (typeof value === 'string' && value !== '') return;
  delete target[key];
  issues.push({ path, message: `${key} must be a non-empty string; ignored` });
}

function applyOptionalEnum<T extends string>(
  target: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string,
  issues: CanvasValidationIssue[],
): void {
  const value = target[key];
  if (value === undefined) return;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return;
  delete target[key];
  issues.push({ path, message: `${key} is not one of ${allowed.join(', ')}; ignored` });
}

function applyOptionalColor(target: Record<string, unknown>, path: string, issues: CanvasValidationIssue[]): void {
  const value = target.color;
  if (value === undefined) return;
  if (isCanvasColor(value)) return;
  delete target.color;
  issues.push({ path, message: `color must be a preset 1-6 or a hex value; ignored` });
}

function normalizeNode(raw: unknown, path: string, seen: Set<string>, issues: CanvasValidationIssue[]): CanvasNode | undefined {
  if (!isRecord(raw)) {
    issues.push({ path, message: 'node must be an object' });
    return undefined;
  }
  const id = raw.id;
  if (typeof id !== 'string' || id === '') {
    issues.push({ path, message: 'node id must be a non-empty string' });
    return undefined;
  }
  if (seen.has(id)) {
    issues.push({ path, message: `duplicate node id "${id}"` });
    return undefined;
  }
  const type = raw.type;
  if (typeof type !== 'string' || !(NODE_TYPES as readonly string[]).includes(type)) {
    issues.push({ path, message: `node "${id}" has unsupported type` });
    return undefined;
  }
  const width = raw.width;
  const height = raw.height;
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) {
    issues.push({ path, message: `node "${id}" needs finite x/y and positive width/height` });
    return undefined;
  }
  const node: CanvasNode = { ...raw, id, type: type as CanvasNodeType, x: raw.x, y: raw.y, width, height };

  if (type === 'text') {
    if (typeof raw.text !== 'string') {
      issues.push({ path, message: `text node "${id}" needs a text string` });
      return undefined;
    }
  } else if (type === 'file') {
    if (typeof raw.file !== 'string' || raw.file === '') {
      issues.push({ path, message: `file node "${id}" needs a file path` });
      return undefined;
    }
    applyOptionalString(node, 'subpath', path, issues);
  } else if (type === 'link') {
    if (typeof raw.url !== 'string' || raw.url === '') {
      issues.push({ path, message: `link node "${id}" needs a url` });
      return undefined;
    }
  } else {
    // group：label/background 可选，backgroundStyle 限规范枚举。
    applyOptionalString(node, 'label', path, issues);
    applyOptionalString(node, 'background', path, issues);
    applyOptionalEnum(node, 'backgroundStyle', BACKGROUND_STYLES, path, issues);
  }
  applyOptionalColor(node, path, issues);
  return node;
}

function normalizeEdge(
  raw: unknown,
  path: string,
  nodeIds: Set<string>,
  seen: Set<string>,
  issues: CanvasValidationIssue[],
  /** 是否要求端点已存在于本文档的节点集合。 */
  requireKnownEndpoints = true,
): CanvasEdge | undefined {
  if (!isRecord(raw)) {
    issues.push({ path, message: 'edge must be an object' });
    return undefined;
  }
  const id = raw.id;
  const fromNode = raw.fromNode;
  const toNode = raw.toNode;
  if (typeof id !== 'string' || id === '') {
    issues.push({ path, message: 'edge id must be a non-empty string' });
    return undefined;
  }
  if (seen.has(id)) {
    issues.push({ path, message: `duplicate edge id "${id}"` });
    return undefined;
  }
  if (typeof fromNode !== 'string' || typeof toNode !== 'string' || fromNode === '' || toNode === '') {
    issues.push({ path, message: `edge "${id}" needs fromNode and toNode` });
    return undefined;
  }
  // 失链连线丢弃并记录：端点必须指向本文档中已接受的节点。
  // 视图布局解析不启这一条：投影行节点的 id 不在文档的 nodes 数组里，而在 projectCanvas
  // 才由行投影产生；这里先丢，连线就永远到不了「按真实行过滤失链」那一步。
  if (requireKnownEndpoints && (!nodeIds.has(fromNode) || !nodeIds.has(toNode))) {
    issues.push({ path, message: `edge "${id}" references a node that does not exist; dropped` });
    return undefined;
  }
  const edge: CanvasEdge = { ...raw, id, fromNode, toNode };
  applyOptionalEnum(edge, 'fromSide', SIDES, path, issues);
  applyOptionalEnum(edge, 'toSide', SIDES, path, issues);
  applyOptionalEnum(edge, 'fromEnd', ENDS, path, issues);
  applyOptionalEnum(edge, 'toEnd', ENDS, path, issues);
  applyOptionalString(edge, 'label', path, issues);
  applyOptionalColor(edge, path, issues);
  return edge;
}

/** JSON Canvas 文档入参。 */
export interface CanvasDocumentInput {
  nodes?: unknown;
  edges?: unknown;
  /** 端点必须存在于 nodes；视图布局解析传 false（端点可能是投影行节点）。默认 true。 */
  requireKnownEndpoints?: boolean;
}

export function parseCanvasDocument(input: CanvasDocumentInput | unknown): CanvasParseResult {
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: 'document', message: 'canvas root must be a JSON object' }] };
  }
  if (input.nodes !== undefined && !Array.isArray(input.nodes)) {
    return { ok: false, issues: [{ path: 'nodes', message: 'nodes must be an array' }] };
  }
  if (input.edges !== undefined && !Array.isArray(input.edges)) {
    return { ok: false, issues: [{ path: 'edges', message: 'edges must be an array' }] };
  }
  // 默认要求端点存在于 nodes；视图布局解析显式传 false。
  const requireKnownEndpoints = input.requireKnownEndpoints !== false;
  const issues: CanvasValidationIssue[] = [];
  const nodes: CanvasNode[] = [];
  const nodeIds = new Set<string>();
  const rawNodes = (input.nodes ?? []) as unknown[];
  if (rawNodes.length > CANVAS_MAX_NODES) {
    issues.push({ path: 'nodes', message: `node count exceeds ${CANVAS_MAX_NODES}; extra nodes dropped` });
  }
  rawNodes.slice(0, CANVAS_MAX_NODES).forEach((raw, index) => {
    const node = normalizeNode(raw, `nodes[${index}]`, nodeIds, issues);
    if (!node) return;
    nodes.push(node);
    nodeIds.add(node.id);
  });

  const edges: CanvasEdge[] = [];
  const edgeIds = new Set<string>();
  const rawEdges = (input.edges ?? []) as unknown[];
  if (rawEdges.length > CANVAS_MAX_EDGES) {
    issues.push({ path: 'edges', message: `edge count exceeds ${CANVAS_MAX_EDGES}; extra edges dropped` });
  }
  rawEdges.slice(0, CANVAS_MAX_EDGES).forEach((raw, index) => {
    const edge = normalizeEdge(raw, `edges[${index}]`, nodeIds, edgeIds, issues, requireKnownEndpoints);
    if (!edge) return;
    edges.push(edge);
    edgeIds.add(edge.id);
  });

  return { ok: true, document: { nodes, edges }, issues };
}

/** 解析 JSON 文本；语法错误即拒绝，给出解析器原文。 */
export function parseCanvasText(text: string): CanvasParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, issues: [{ path: 'document', message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` }] };
  }
  return parseCanvasDocument(parsed);
}

function serializeEntry(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const known = new Set(keys);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) out[key] = value;
  }
  for (const [key, value] of Object.entries(source)) {
    if (!known.has(key) && value !== undefined) out[key] = value;
  }
  return out;
}

/** 序列化 JSON Canvas 对象：固定已知字段顺序，规范外扩展字段随后，便于稳定往返。 */
export function toCanvasDocument(document: CanvasDocument): Record<string, unknown> {
  return {
    nodes: document.nodes.map((node) => serializeEntry(node, NODE_KEYS)),
    edges: document.edges.map((edge) => serializeEntry(edge, EDGE_KEYS)),
  };
}

/** 序列化为 `.canvas` 文本（缩进两格，末尾换行）。 */
export function serializeCanvas(document: CanvasDocument): string {
  return `${JSON.stringify(toCanvasDocument(document), null, 2)}\n`;
}
