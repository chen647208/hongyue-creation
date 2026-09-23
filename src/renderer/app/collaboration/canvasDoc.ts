/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 画布元素的 Y.Doc 存储：与章节协同共用同一份文档，新增顶层键 `canvas`（docs/design/47 §6）。
 *
 * 结构：`canvas` 为 Y.Map，键为视图 id，值为 Y.Array<Y.Map> 的「元素状态日志」。
 * 写入只做追加（每条状态是完整快照），Yjs 只负责日志复制；收敛规则全部来自
 * elementConvergence 契约（resolveElement / mergeElementStates / orderVisibleElements），
 * 不另立第二套收敛规则。
 *
 * 元素与契约四要素的对应：
 * - 版本号 version：元素自己的单调计数器，本地写入取「文档当前胜者版本 + 1」；
 * - 随机决胜 clientId：写入方 Y.Doc.clientID 的定宽十进制（10 位，Yjs clientID < 2^32，
 *   定宽使字典序等价于数值序），与契约按 clientId 决胜一致；
 * - 墓碑 deleted：删除不物理移除条目，而是追加一条 deleted 状态，阻止旧更新复活；
 *   同步轮次（收到对端更新）后由 purgeCanvasTombstones 清除；
 * - 分数 score：可见元素的排序分（越大越靠前），读侧按 orderVisibleElements 稳定排序。
 *   新元素取「现有胜者最低分 - 1」起递减赋值，既有元素的分只在文档中保留、不随本地重推改变，
 *   避免两端互相改序。
 *
 * 元素分三类：position 为行投影坐标（键为行 id，无序，读入 CanvasLayout.positions）、
 * node 为自由节点（读入 CanvasLayout.nodes）、edge 为连线（读入 CanvasLayout.edges）。
 * 行节点内容仍来自行数据，本模块只存坐标与连线，不复制行内容。
 */
import * as Y from 'yjs';

import { type ElementState,mergeElementStates, orderVisibleElements, resolveElement } from '@/features/collaboration/elementConvergence';
import type { CanvasEdge, CanvasNode } from '@/features/views/jsonCanvas';
import type { CanvasLayout, CanvasPoint } from '@/features/views/types';

/** 画布数据在协作文档中的顶层键。 */
const CANVAS_KEY = 'canvas';

/** 本地画布写入的事务来源标记：文档更新据此把本地写入与远程更新区分开。 */
export const CANVAS_LOCAL_ORIGIN = 'local-canvas';

/** 会话启动播种画布时的事务来源标记（无对端响应用本地视图初始化文档）。 */
export const CANVAS_SEED_ORIGIN = 'seed-canvas';

/** clientId 定宽：Yjs clientID 为 32 位无符号整数（< 2^32），10 位十进制可容纳。 */
const CLIENT_ID_WIDTH = 10;

/** 元素种类：position 为行投影坐标，node 为自由节点，edge 为连线。 */
export type CanvasElementKind = 'position' | 'node' | 'edge';

type CanvasEntry = Y.Map<unknown>;
type CanvasElements = Y.Array<CanvasEntry>;

/** 一条日志条目：元素状态加种类（种类只用于重建布局，不参与收敛）。 */
interface CanvasEntryState {
  kind: CanvasElementKind;
  state: ElementState;
}

function getCanvasMap(doc: Y.Doc): Y.Map<CanvasElements> {
  return doc.getMap<CanvasElements>(CANVAS_KEY);
}

function canvasClientId(doc: Y.Doc): string {
  return doc.clientID.toString().padStart(CLIENT_ID_WIDTH, '0');
}

function isKind(value: unknown): value is CanvasElementKind {
  return value === 'position' || value === 'node' || value === 'edge';
}

/** 读非空字符串；空串与类型不符一律视为缺失。 */
function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** 读可选字符串；空串同样丢弃（可选字段要么有意义要么不存在）。 */
function readString(value: unknown): string | undefined {
  return readNonEmptyString(value);
}

function readFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 读一条日志条目；字段缺失或类型不符即丢弃（deny-by-default，不让脏数据参与收敛）。 */
function readEntry(entry: unknown): CanvasEntryState | undefined {
  if (!(entry instanceof Y.Map)) return undefined;
  const kind = entry.get('kind');
  const id = entry.get('id');
  const version = readFinite(entry.get('version'));
  const score = readFinite(entry.get('score'));
  const updatedAt = readFinite(entry.get('updatedAt'));
  const clientId = entry.get('clientId');
  if (!isKind(kind)) return undefined;
  if (typeof id !== 'string' || id === '') return undefined;
  if (version === undefined || score === undefined || updatedAt === undefined) return undefined;
  if (typeof clientId !== 'string' || clientId === '') return undefined;
  const state: ElementState = {
    id,
    version,
    score,
    deleted: entry.get('deleted') === true,
    updatedAt,
    clientId,
  };
  const data = entry.get('data');
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) state.data = data as Record<string, unknown>;
  return { kind, state };
}

function readViewEntries(elements: CanvasElements): CanvasEntryState[] {
  const entries: CanvasEntryState[] = [];
  elements.forEach((entry) => {
    const parsed = readEntry(entry);
    if (parsed) entries.push(parsed);
  });
  return entries;
}

/** 文档中某视图的完整状态日志（未合并）：调试与「契约合并 == 文档合并」断言用。 */
export function docCanvasStateLog(doc: Y.Doc, viewId: string): ElementState[] {
  const elements = getCanvasMap(doc).get(viewId);
  if (!(elements instanceof Y.Array)) return [];
  return readViewEntries(elements).map((entry) => entry.state);
}

/** 按契约合并后的状态：每个元素 id 一条胜者。 */
export function docCanvasStates(doc: Y.Doc, viewId: string): ElementState[] {
  return mergeElementStates(docCanvasStateLog(doc, viewId));
}

/** 按 id 归并日志条目；胜者确定用 resolveElement（与 mergeElementStates 同一规则）。 */
function mergeEntries(entries: CanvasEntryState[]): Map<string, CanvasEntryState> {
  const merged = new Map<string, CanvasEntryState>();
  for (const entry of entries) {
    const current = merged.get(entry.state.id);
    if (!current) {
      merged.set(entry.state.id, entry);
      continue;
    }
    merged.set(entry.state.id, { kind: entry.kind, state: resolveElement(current.state, entry.state) });
  }
  return merged;
}

/** 元素 id → 种类：同一 id 取日志中首次出现的种类（projectCanvas 同样按行优先去重）。 */
function entryKinds(entries: CanvasEntryState[]): Map<string, CanvasElementKind> {
  const kinds = new Map<string, CanvasElementKind>();
  for (const entry of entries) {
    if (!kinds.has(entry.state.id)) kinds.set(entry.state.id, entry.kind);
  }
  return kinds;
}

function readPoint(data: Record<string, unknown> | undefined): CanvasPoint | undefined {
  if (!data) return undefined;
  const x = readFinite(data.x);
  const y = readFinite(data.y);
  if (x === undefined || y === undefined) return undefined;
  const width = readFinite(data.width);
  const height = readFinite(data.height);
  const point: CanvasPoint = { x, y };
  if (width !== undefined && width > 0) point.width = width;
  if (height !== undefined && height > 0) point.height = height;
  return point;
}

function readNode(data: Record<string, unknown> | undefined): CanvasNode | undefined {
  if (!data) return undefined;
  const id = readNonEmptyString(data.id);
  const type = data.type;
  const x = readFinite(data.x);
  const y = readFinite(data.y);
  const width = readFinite(data.width);
  const height = readFinite(data.height);
  if (id === undefined || x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined;
  }
  if (type !== 'text' && type !== 'file' && type !== 'link' && type !== 'group') return undefined;
  // 按校验过的字段重建，不做整体强转：Record<string, unknown> 到结构体的收窄必须
  // 逐字段落地，否则读进来的脏字段会绕过 jsonCanvas 的校验。可选字段逐个窄化后补。
  const node: CanvasNode = { id, type, x, y, width, height };
  const color = readString(data.color);
  if (color !== undefined) node.color = color;
  const text = readString(data.text);
  if (text !== undefined) node.text = text;
  const file = readString(data.file);
  if (file !== undefined) node.file = file;
  const label = readString(data.label);
  if (label !== undefined) node.label = label;
  // data 在前保留 jsonCanvas 的其余可选字段，node 在后确保必填字段是校验过的值。
  return { ...data, ...node };
}

function readEdge(data: Record<string, unknown> | undefined): CanvasEdge | undefined {
  if (!data) return undefined;
  const id = readNonEmptyString(data.id);
  const fromNode = readNonEmptyString(data.fromNode);
  const toNode = readNonEmptyString(data.toNode);
  if (id === undefined || fromNode === undefined || toNode === undefined) return undefined;
  // 同 readNode：逐字段重建，可选串字段窄化后补，不做整体强转。
  const edge: CanvasEdge = { id, fromNode, toNode };
  const color = readString(data.color);
  if (color !== undefined) edge.color = color;
  const label = readString(data.label);
  if (label !== undefined) edge.label = label;
  return { ...data, ...edge };
}

/** 只保留非空部分，与 canvasView.cleanLayout 的持久化约定一致。 */
function cleanCanvas(parts: { positions: Record<string, CanvasPoint>; nodes: CanvasNode[]; edges: CanvasEdge[] }): CanvasLayout | undefined {
  const layout: CanvasLayout = {};
  if (Object.keys(parts.positions).length > 0) layout.positions = parts.positions;
  if (parts.nodes.length > 0) layout.nodes = parts.nodes;
  if (parts.edges.length > 0) layout.edges = parts.edges;
  return Object.keys(layout).length > 0 ? layout : undefined;
}

/**
 * 读取某视图的画布布局：合并全部日志条目，按契约过滤墓碑并稳定排序。
 * 没有状态条目（该视图从未参与协作）时返回 undefined，本地存储保持原样。
 */
export function docToCanvasLayout(doc: Y.Doc, viewId: string): CanvasLayout | undefined {
  const elements = getCanvasMap(doc).get(viewId);
  if (!(elements instanceof Y.Array)) return undefined;
  const entries = readViewEntries(elements);
  if (entries.length === 0) return undefined;
  const kinds = entryKinds(entries);
  const positions: Record<string, CanvasPoint> = {};
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  for (const state of orderVisibleElements(mergeElementStates(entries.map((entry) => entry.state)))) {
    const kind = kinds.get(state.id);
    if (kind === 'position') {
      const point = readPoint(state.data);
      if (point) positions[state.id] = point;
    } else if (kind === 'node') {
      const node = readNode(state.data);
      if (node) nodes.push(node);
    } else if (kind === 'edge') {
      const edge = readEdge(state.data);
      if (edge) edges.push(edge);
    }
  }
  return cleanCanvas({ positions, nodes, edges });
}

/** 深度相等（JSON 值）：键序无关，用于判定本地布局与文档状态是否相同。 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = canonical(source[key]);
    return out;
  }
  return value;
}

function sameData(left: Record<string, unknown> | undefined, right: Record<string, unknown> | undefined): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

/** 两份画布布局是否等价：文档状态与本地存储比对用（键序无关）。 */
export function sameCanvasLayout(left: CanvasLayout | undefined, right: CanvasLayout | undefined): boolean {
  return JSON.stringify(canonical(left ?? {})) === JSON.stringify(canonical(right ?? {}));
}

/** 待写入的元素种子：只带种类、id 与载荷；版本、决胜字段与分数在写入时推导。 */
interface CanvasSeed {
  kind: CanvasElementKind;
  id: string;
  data: Record<string, unknown>;
}

/** 把布局摊平为元素种子：行坐标、自由节点、连线各按自身 id 成条目。 */
function layoutSeeds(layout: CanvasLayout): CanvasSeed[] {
  const seeds: CanvasSeed[] = [];
  for (const [id, point] of Object.entries(layout.positions ?? {})) {
    seeds.push({ kind: 'position', id, data: { ...point } });
  }
  for (const node of layout.nodes ?? []) {
    seeds.push({ kind: 'node', id: node.id, data: { ...node } });
  }
  for (const edge of layout.edges ?? []) {
    seeds.push({ kind: 'edge', id: edge.id, data: { ...edge } });
  }
  return seeds;
}

function ensureElements(doc: Y.Doc, viewId: string): CanvasElements {
  const canvas = getCanvasMap(doc);
  const existing = canvas.get(viewId);
  if (existing instanceof Y.Array) return existing;
  const created = new Y.Array<CanvasEntry>();
  canvas.set(viewId, created);
  return created;
}

interface PushFields {
  kind: CanvasElementKind;
  id: string;
  version: number;
  clientId: string;
  updatedAt: number;
  deleted: boolean;
  score: number;
  data?: Record<string, unknown>;
}

function pushState(elements: CanvasElements, fields: PushFields): void {
  const map = new Y.Map<unknown>();
  map.set('kind', fields.kind);
  map.set('id', fields.id);
  map.set('version', fields.version);
  map.set('clientId', fields.clientId);
  map.set('updatedAt', fields.updatedAt);
  map.set('deleted', fields.deleted);
  map.set('score', fields.score);
  if (fields.data) map.set('data', fields.data);
  elements.push([map]);
}

/**
 * 读取并归并某视图的日志条目：胜者确定规则与 mergeElementStates 一致（同为 resolveElement 折叠）。
 * applyCanvasLayoutToDoc 需要胜者的种类与分数，因此走这一份归并结果。
 */
function mergedEntries(doc: Y.Doc, viewId: string): Map<string, CanvasEntryState> {
  const elements = getCanvasMap(doc).get(viewId);
  if (!(elements instanceof Y.Array)) return new Map();
  return mergeEntries(readViewEntries(elements));
}

/**
 * 把本地画布布局的增删改写进文档（对既有 API 的增量，不动章节协同）：
 * - 新元素：版本 1，分数从「现有胜者最低分 - 1」起按布局序递减，排在有分者之后；
 * - 内容变化：版本取胜者版本 + 1，分数沿用胜者（不在本地重推时改序）；
 * - 与胜者完全一致：不写（推送是幂等的，重复保存视图不产生版本噪声）；
 * - 本地缺席而已有胜者未删：追加墓碑（版本 + 1），阻止对端旧更新复活。
 * 事务来源为 origin，缺省本地画布写入；会话无对端时的播种传 CANVAS_SEED_ORIGIN。
 */
export function applyCanvasLayoutToDoc(doc: Y.Doc, viewId: string, layout: CanvasLayout, origin: unknown = CANVAS_LOCAL_ORIGIN): void {
  const merged = mergedEntries(doc, viewId);
  const seeds = layoutSeeds(layout);
  const seedIds = new Set(seeds.map((seed) => seed.id));
  const now = Date.now();
  const clientId = canvasClientId(doc);
  const pushes: PushFields[] = [];
  let nextNewScore = 0;
  const existingScores = [...merged.values()].map((entry) => entry.state.score);
  if (existingScores.length > 0) nextNewScore = Math.min(...existingScores) - 1;

  for (const seed of seeds) {
    const current = merged.get(seed.id);
    const score = current ? current.state.score : nextNewScore;
    if (!current) nextNewScore -= 1;
    if (current && !current.state.deleted && sameData(current.state.data, seed.data)) continue;
    pushes.push({
      kind: seed.kind,
      id: seed.id,
      version: (current?.state.version ?? 0) + 1,
      clientId,
      updatedAt: now,
      deleted: false,
      score,
      data: seed.data,
    });
  }
  for (const [id, current] of merged) {
    if (current.state.deleted || seedIds.has(id)) continue;
    pushes.push({
      kind: current.kind,
      id,
      version: current.state.version + 1,
      clientId,
      updatedAt: now,
      deleted: true,
      score: current.state.score,
      data: current.state.data,
    });
  }
  if (pushes.length === 0) return;
  doc.transact(() => {
    const elements = ensureElements(doc, viewId);
    for (const fields of pushes) pushState(elements, fields);
  }, origin);
}

/**
 * 清除墓碑与被取代的状态：每个元素只保留胜者，墓碑胜者整条移除。
 * 在收到对端更新（同步轮次完成）后调用：两端已交换过状态，被清除的旧状态不会再生复活；
 * 墓碑清除后若对端仍持有一条未被任何墓碑覆盖的旧更新，按契约由该旧更新胜出（收敛以契约为准）。
 */
export function purgeCanvasTombstones(doc: Y.Doc): void {
  const canvas = getCanvasMap(doc);
  doc.transact(() => {
    canvas.forEach((elements) => {
      if (!(elements instanceof Y.Array)) return;
      const entries = readViewEntries(elements);
      const winners = mergeEntries(entries);
      const keep = new Set<number>();
      entries.forEach((entry, index) => {
        const winner = winners.get(entry.state.id);
        if (winner?.state === entry.state && !winner.state.deleted) keep.add(index);
      });
      const drop: number[] = [];
      entries.forEach((entry, index) => {
        if (!keep.has(index)) drop.push(index);
      });
      // 倒序删除，避免前删后索引位移。
      for (let index = drop.length - 1; index >= 0; index -= 1) {
        elements.delete(drop[index] ?? 0, 1);
      }
    });
  }, CANVAS_LOCAL_ORIGIN);
}
