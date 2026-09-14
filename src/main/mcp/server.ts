/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * MCP server 出口（docs/design/05 §6）：stdio 上的 newline-delimited JSON-RPC。
 *
 * 由外部 MCP 客户端（codex/Claude 等）作为独立进程拉起：
 *   node build/main/main/mcp/server.js
 * 数据目录默认取 Electron userData（可用 HONGYUE_DATA_DIR 覆盖），直接读 SQLite。
 * 读工具实时查询；写工具产出「提案」进入应用内待审箱（跨表面 fan-out：
 * 渲染端 ApprovalHost 轮询 pending-proposals.jsonl 后由用户决定），
 * 绝不静默写库——与内置 agent 的审批管线同权同源。
 *
 * 协议仅实现本服务器需要的最小集：initialize / tools/list / tools/call /
 * resources/list / resources/read。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3-multiple-ciphers';

import { uuidv7 } from '../../core/entities/uuid.js';
import { DEFAULT_SEARCH_LIMIT,MIN_SEARCH_QUERY_LENGTH, toFtsPhrase,toLikePattern } from '../../shared/constants/search.js';
import { SQL } from '../../shared/sql/catalog.js';
import {
  APP_DATA_DIR_NAME,
  dataDirOverride,
  DB_FILE_NAME,
  legacyDataDir,
  migrateLegacyDataDirSync,
  standardDataDir,
} from '../app/dataDir.js';

const PROTOCOL_VERSION = '2025-03-26';

/** 独立 server 的数据目录：覆盖键 → 新默认 → 旧默认（过渡读，应用启动即迁走）。 */
function dataDir(): string {
  const override = dataDirOverride();
  if (override) return override;
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', APP_DATA_DIR_NAME);
    case 'win32':
      return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), APP_DATA_DIR_NAME);
    default:
      return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), APP_DATA_DIR_NAME);
  }
}

function dbPath(): string {
  return path.join(dataDir(), DB_FILE_NAME);
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    if (!fs.existsSync(dbPath())) {
      throw new Error(`数据库不存在：${dbPath()}`);
    }
    db = new Database(dbPath(), { readonly: true });
  }
  return db;
}

// ── 数据读取 ────────────────────────────────────────────────────────────

interface NodeRow {
  id: string;
  book_id: string;
  type: string;
  title: string;
  body: string;
  updated_at: number;
}

function listBooks(): Array<{ bookId: string; nodes: number; updatedAt: number }> {
  const rows = getDb()
    .prepare(`SELECT book_id, COUNT(*) AS n, MAX(updated_at) AS last FROM nodes WHERE erased = 0 GROUP BY book_id ORDER BY last DESC`)
    .all() as Array<{ book_id: string; n: number; last: number }>;
  return rows.map((r) => ({ bookId: r.book_id, nodes: r.n, updatedAt: r.last }));
}

function listNodes(bookId: string): NodeRow[] {
  return getDb()
    .prepare(`SELECT id, book_id, type, title, body, updated_at FROM nodes WHERE book_id = ? AND erased = 0 ORDER BY type, title`)
    .all(bookId) as unknown as NodeRow[];
}

function getNode(nodeId: string): (NodeRow & { attrs: Array<{ name: string; value: string }> }) | null {
  const node = getDb()
    .prepare(`SELECT id, book_id, type, title, body, updated_at FROM nodes WHERE id = ? AND erased = 0`)
    .get(nodeId) as NodeRow | undefined;
  if (!node) return null;
  const attrs = getDb()
    .prepare(`SELECT name, value FROM attrs WHERE node_id = ? AND erased = 0 ORDER BY position`)
    .all(nodeId) as Array<{ name: string; value: string }>;
  return { ...node, attrs };
}

/** catalog `fts.search` 返回列的命中子集。 */
interface FtsHitRow {
  node_id: string;
  type: string;
  title: string;
}

/** `search_nodes` 的单条命中：节点 id、类型、标题。 */
interface SearchNodeHit {
  id: string;
  type: string;
  title: string;
}

/**
 * 标题/正文检索：走 catalog 的 `fts.search`（`nodes_fts`，FTS5 trigram）。
 * SQL 文本取自语句目录，查询词经 `toFtsPhrase` 包成短语后走绑定参数，不拼接 SQL。
 * 传入连接以便单测直接复用内存库。
 */
export function querySearchNodes(database: Database.Database, bookId: string, keyword: string): SearchNodeHit[] {
  const q = keyword.trim();
  if (q.length < MIN_SEARCH_QUERY_LENGTH) return [];
  const ftsRows = database
    .prepare(SQL['fts.search'])
    .all(toFtsPhrase(q), bookId, bookId, DEFAULT_SEARCH_LIMIT) as FtsHitRow[];
  // 标题回退：FTS 只索引章节/知识库正文，其余节点（角色/地点/势力等）按标题匹配
  const likeRows = database
    .prepare(SQL['nodes.selectByTitleLike'])
    .all(bookId, toLikePattern(q), DEFAULT_SEARCH_LIMIT) as SearchNodeHit[];
  const seen = new Set<string>();
  const hits: SearchNodeHit[] = [];
  for (const row of ftsRows) {
    if (seen.has(row.node_id)) continue;
    seen.add(row.node_id);
    hits.push({ id: row.node_id, type: row.type, title: row.title });
  }
  for (const row of likeRows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    hits.push(row);
  }
  return hits.slice(0, DEFAULT_SEARCH_LIMIT);
}

function searchNodes(bookId: string, keyword: string): SearchNodeHit[] {
  return querySearchNodes(getDb(), bookId, keyword);
}

// ── 写提案（进待审箱，不直接落库）─────────────────────────────────────

function bookIdOfNode(nodeId: string): string | undefined {
  try {
    const row = getDb()
      .prepare(`SELECT book_id FROM nodes WHERE id = ? AND erased = 0`)
      .get(nodeId) as { book_id?: string } | undefined;
    return row?.book_id;
  } catch {
    return undefined;
  }
}

function appendProposal(toolId: string, args: Record<string, unknown>): { accepted: boolean; proposalId: string } {
  const proposalId = `mcp_${Date.now().toString(36)}_${uuidv7()}`;
  const title = String(args.title ?? toolId);
  const body = String(args.body ?? '');
  const nodeId = typeof args.nodeId === 'string' && args.nodeId ? args.nodeId : undefined;
  // bookId 优先用调用方显式值，否则按节点反查（章节写）；卡片写缺 bookId 则由渲染端执行器拒绝并提示
  const bookId =
    (typeof args.bookId === 'string' && args.bookId ? args.bookId : undefined) ??
    (nodeId ? bookIdOfNode(nodeId) : undefined);
  const line = JSON.stringify({
    id: proposalId,
    callId: proposalId,
    toolId,
    permission: 'write:proposal',
    proposal: {
      title,
      summary: '来自外部 MCP agent 的写入提案',
      suggestion: body,
      exec: {
        kind: toolId === 'propose_chapter_write' ? 'chapter-write' : 'card-write',
        bookId,
        nodeId,
        type: typeof args.type === 'string' ? args.type : undefined,
        title,
        body,
      },
    },
    createdAt: Date.now(),
  });
  const dir = path.join(dataDir(), 'ai-sessions');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'pending-proposals.jsonl'), `${line}\n`, 'utf-8');
  return { accepted: true, proposalId };
}

// ── MCP 工具与资源清单 ─────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_books',
    description: '列出全部书籍（bookId、节点数、最近更新时间）',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_nodes',
    description: '列出某本书的全部节点（章节/角色/地点/势力等）的元信息',
    inputSchema: {
      type: 'object',
      properties: { bookId: { type: 'string', description: '书籍 id' } },
      required: ['bookId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_node',
    description: '读取节点全文与属性（正文/设定）',
    inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'search_nodes',
    description: '按关键词在标题与正文中检索节点',
    inputSchema: {
      type: 'object',
      properties: { bookId: { type: 'string' }, keyword: { type: 'string' } },
      required: ['bookId', 'keyword'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'propose_card_write',
    description: '提交卡片写入提案（角色/地点/势力等设定）；进入应用待审箱，用户批准后生效',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '提案标题' },
        type: { type: 'string', description: '节点类型，如 character/location/faction' },
        body: { type: 'string', description: '卡片内容（Markdown）' },
        bookId: { type: 'string', description: '目标书籍 id（缺席则执行器拒绝并提示）' },
      },
      required: ['title'],
    },
  },
  {
    name: 'propose_chapter_write',
    description: '提交章节正文写入提案；进入应用待审箱，用户批准后生效',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '提案标题，如「重写第 3 章」' },
        nodeId: { type: 'string', description: '目标章节节点 id' },
        body: { type: 'string', description: '新的正文全文' },
        bookId: { type: 'string', description: '目标书籍 id（缺席时按节点反查）' },
      },
      required: ['title', 'nodeId', 'body'],
    },
  },
];

const RESOURCES = [
  { uri: 'books://index', name: '全部书籍索引', mimeType: 'text/plain' },
  // URI 模板：单书目录按 book://{bookId}/toc 读取（resources/read 已实现，此处宣告可发现）
  { uriTemplate: 'book://{bookId}/toc', name: '单书目录', mimeType: 'text/plain' },
];

function tocText(bookId: string): string {
  const rows = listNodes(bookId);
  return rows.map((r) => `[${r.type}] ${r.title} (${r.id})`).join('\n') || '(空书)';
}

// ── JSON-RPC 框架 ──────────────────────────────────────────────────────

type JsonRpcRequest = { jsonrpc: '2.0'; id?: string | number; method: string; params?: Record<string, unknown> };

function textResult(text: string, isError = false): Record<string, unknown> {
  return { content: [{ type: 'text', text }], isError };
}

function dispatch(method: string, params: Record<string, unknown>): Record<string, unknown> {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'hongyue-mcp', version: '1.0.0' },
      };
    case 'tools/list':
      return { tools: TOOLS };
    case 'resources/list':
      return { resources: RESOURCES };
    case 'resources/read': {
      const uri = String(params.uri ?? '');
      if (uri === 'books://index') {
        return {
          contents: [{ uri, mimeType: 'text/plain', text: listBooks().map((b) => `${b.bookId}（${b.nodes} 节点）`).join('\n') || '(无书籍)' }],
        };
      }
      // book://{bookId}/toc：单书目录（design/05 §6 资源）
      const tocMatch = uri.match(/^book:\/\/([^/]+)\/toc$/);
      if (tocMatch) {
        return { contents: [{ uri, mimeType: 'text/plain', text: tocText(tocMatch[1] ?? '') }] };
      }
      throw new Error(`未知资源：${uri}`);
    }
    case 'tools/call': {
      const name = String(params.name ?? '');
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      switch (name) {
        case 'list_books':
          return textResult(JSON.stringify(listBooks(), null, 2));
        case 'list_nodes':
          return textResult(JSON.stringify(listNodes(String(args.bookId ?? '')).map(({ body: _body, ...rest }) => rest), null, 2));
        case 'get_node': {
          const node = getNode(String(args.nodeId ?? ''));
          return node ? textResult(JSON.stringify(node, null, 2)) : textResult('节点不存在', true);
        }
        case 'search_nodes':
          return textResult(JSON.stringify(searchNodes(String(args.bookId ?? ''), String(args.keyword ?? '')), null, 2));
        case 'propose_card_write':
        case 'propose_chapter_write': {
          const r = appendProposal(name, args);
          return textResult(`提案 ${r.proposalId} 已进入应用待审箱，等待用户在红月创作中批准。`);
        }
        default:
          return textResult(`未知工具：${name}`, true);
      }
    }
    default:
      throw new Error(`未知方法：${method}`);
  }
}

/** 导出分发器（单测直接调用；stdio 入口走 handleLine）。 */
export { dispatch };

function handleLine(line: string): void {
  let msg: JsonRpcRequest;
  try {
    msg = JSON.parse(line) as JsonRpcRequest;
  } catch {
    return;
  }
  if (!msg.id) return; // notification：无需回复
  try {
    const result = dispatch(msg.method, msg.params ?? {});
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } })}\n`,
    );
  }
}

function main(): void {
  // 独立拉起也先迁一次（幂等）：仅标准路径跑，覆盖键指向的调试目录不动
  if (path.resolve(dataDir()) === path.resolve(standardDataDir())) {
    try {
      migrateLegacyDataDirSync(legacyDataDir(), dataDir());
    } catch (err) {
      process.stderr.write(`数据目录迁移失败（稍后重试）：${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
  // 长驻行式读取：MCP 客户端保持 stdio 打开并逐条发送请求
  let buffer = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let idx = buffer.indexOf('\n');
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) handleLine(line);
      idx = buffer.indexOf('\n');
    }
  });
  process.stdin.resume();
}

const invokedDirectly = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('mcp/server.js');
if (invokedDirectly) {
  main();
}
