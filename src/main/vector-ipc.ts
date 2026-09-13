/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 向量索引 IPC —— 在主进程中托管 Vectra 本地索引。
 * 线格式（documents / 搜索结果）与旧版 main.js 保持完全一致，
 * 以保证磁盘上已有索引与渲染层现有调用无需改动。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { app, ipcMain } from 'electron';

import { IPC } from './channels.js';
import { logger } from './logger.js';

/**
 * vectra 是 CJS 包，主进程为 ESM（NodeNext）。
 * 静态具名导入在运行时可能触发 "Named export not found"，
 * 因此沿用原实现的动态 import() 并缓存构造器。
 */
type LocalIndexCtor = new (dir: string) => LocalIndexInstance;
interface LocalIndexInstance {
  isIndexCreated(): Promise<boolean>;
  createIndex(): Promise<void>;
  insertItem(item: { id: string; vector: number[]; metadata: Record<string, unknown> }): Promise<void>;
  deleteItem(id: string): Promise<void>;
  queryItems(vector: number[], query: string, topK: number): Promise<Array<{ item: VectraItem; score: number }>>;
  listItems(): Promise<VectraItem[]>;
}

let LocalIndexCtorCache: LocalIndexCtor | null = null;
async function loadLocalIndex(): Promise<LocalIndexCtor> {
  if (LocalIndexCtorCache) return LocalIndexCtorCache;
  const mod = (await import('vectra')) as unknown as { LocalIndex: LocalIndexCtor; default?: { LocalIndex: LocalIndexCtor } };
  const ctor = mod.LocalIndex ?? mod.default?.LocalIndex;
  if (!ctor) throw new Error('Vectra LocalIndex 不可用');
  LocalIndexCtorCache = ctor;
  return ctor;
}

/** 渲染层写入索引时携带的文档元数据 */
interface VectorDocumentMetadata {
  category?: string;
  type?: string;
  size?: number;
  addedAt?: number;
  chunkIndex?: number;
  totalChunks?: number;
}

/** 渲染层通过 IPC 提交的文档（embedding 已在渲染层计算完成） */
interface VectorDocumentInput {
  id: string;
  projectId: string;
  knowledgeItemId?: string;
  content: string;
  embedding: number[];
  metadata?: VectorDocumentMetadata;
}

interface VectraItem {
  id: string;
  metadata?: Record<string, unknown>;
  vector?: number[];
}

interface IpcResult<T = unknown> {
  success: boolean;
  error?: string;
  [key: string]: unknown;
  data?: T;
}

/** 将项目 ID 清洗为可安全用于目录名的字符串 */
function safeProjectDir(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** 向量维度上限 */
const MAX_EMBEDDING_DIM = 8192;
/** 单次写入/删除文档数上限 */
const MAX_DOCUMENTS_PER_CALL = 5000;
/** 语义检索返回条数上限 */
const MAX_SEARCH_LIMIT = 100;

/** IPC 边界校验：项目 ID */
function assertProjectId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw new TypeError('Invalid projectId');
  }
}

/** IPC 边界校验：单条向量文档 */
function assertDocument(value: unknown): asserts value is VectorDocumentInput {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid document');
  const doc = value as Partial<VectorDocumentInput>;
  if (typeof doc.id !== 'string' || doc.id.length === 0) throw new TypeError('Invalid document.id');
  if (typeof doc.content !== 'string') throw new TypeError('Invalid document.content');
  if (!Array.isArray(doc.embedding) || doc.embedding.length === 0 || doc.embedding.length > MAX_EMBEDDING_DIM) {
    throw new TypeError('Invalid document.embedding');
  }
  for (const n of doc.embedding) {
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new TypeError('Invalid embedding value');
  }
}

function assertDocumentList(value: unknown): asserts value is VectorDocumentInput[] {
  if (!Array.isArray(value) || value.length > MAX_DOCUMENTS_PER_CALL) {
    throw new TypeError('Invalid documents');
  }
  for (const doc of value) assertDocument(doc);
}

function assertStringList(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length > MAX_DOCUMENTS_PER_CALL) {
    throw new TypeError('Invalid documentIds');
  }
  for (const id of value) {
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('Invalid documentId');
  }
}

/** IPC 边界校验：查询向量 */
function assertEmbedding(value: unknown): asserts value is number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EMBEDDING_DIM) {
    throw new TypeError('Invalid queryEmbedding');
  }
  for (const n of value) {
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new TypeError('Invalid embedding value');
  }
}

/** 从 Vectra item 还原渲染层期望的文档结构 */
const SEARCH_SNIPPET_MAX = 240;

/** 语义搜索结果只回传截断片段，避免整段正文跨进程。 */
function snippetText(value: unknown): string {
  const text = String(value ?? '');
  return text.length > SEARCH_SNIPPET_MAX ? text.slice(0, SEARCH_SNIPPET_MAX) : text;
}

function itemToSearchResult(item: VectraItem, score: number, fallbackProjectId: string) {
  const meta = (item.metadata ?? {}) as VectorDocumentMetadata & { projectId?: string; knowledgeItemId?: string; content?: string };
  return {
    document: {
      id: item.id,
      projectId: String(meta.projectId ?? fallbackProjectId),
      knowledgeItemId: String(meta.knowledgeItemId ?? ''),
      content: snippetText(meta.content),
      embedding: [] as number[], // 不跨进程回传完整向量
      metadata: {
        category: meta.category ?? 'writing',
        type: meta.type ?? 'text',
        size: meta.size ?? 0,
        addedAt: meta.addedAt ?? Date.now(),
        chunkIndex: meta.chunkIndex,
        totalChunks: meta.totalChunks,
      },
    },
    score,
    content: snippetText(meta.content),
    metadata: {
      category: meta.category ?? 'writing',
      type: meta.type ?? 'text',
      size: meta.size ?? 0,
      addedAt: meta.addedAt ?? Date.now(),
      chunkIndex: meta.chunkIndex,
      totalChunks: meta.totalChunks,
      name: String(meta.knowledgeItemId ?? ''),
    },
  };
}

/**
 * 索引生命周期管理：
 * - 缓存的是 Promise，天然避免同一项目并发创建索引的竞态
 * - 初始化失败时移除缓存，允许下次调用重试
 */
class VectorIndexService {
  private basePath = '';
  private indices = new Map<string, Promise<LocalIndexInstance>>();

  async initialize(): Promise<void> {
    if (this.basePath) return;
    this.basePath = path.join(app.getPath('userData'), 'vectra_indices');
    await fs.mkdir(this.basePath, { recursive: true });
    logger.info('vector', `Vector index base path: ${this.basePath}`);
  }

  private createIndex(projectId: string): Promise<LocalIndexInstance> {
    return (async () => {
      await this.initialize();
      const LocalIndex = await loadLocalIndex();
      const index = new LocalIndex(path.join(this.basePath, safeProjectDir(projectId)));
      if (!(await index.isIndexCreated())) {
        await index.createIndex();
        logger.info('vector', `Created Vectra index for project ${projectId}`);
      }
      return index;
    })();
  }

  async getIndex(projectId: string): Promise<LocalIndexInstance> {
    let pending = this.indices.get(projectId);
    if (!pending) {
      pending = this.createIndex(projectId);
      this.indices.set(projectId, pending);
      pending.catch(() => {
        // 失败不缓存，允许后续调用重建
        this.indices.delete(projectId);
      });
    }
    return pending;
  }

  forget(projectId: string): void {
    this.indices.delete(projectId);
  }
}

const service = new VectorIndexService();

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 注册全部 vector:* IPC 处理器（在 app ready 后调用一次） */
export function registerVectorIpc(): void {
  ipcMain.handle(IPC.vector.initialize, async (): Promise<IpcResult> => {
    try {
      await service.initialize();
      return { success: true };
    } catch (e) {
      logger.error('vector', 'initialize failed', e);
      return { success: false, error: errorMessage(e) };
    }
  });

  ipcMain.handle(IPC.vector.addDocuments, async (_event, projectId: string, documents: VectorDocumentInput[]): Promise<IpcResult> => {
    try {
      assertProjectId(projectId);
      assertDocumentList(documents);
      const index = await service.getIndex(projectId);
      const inserted = await Promise.all(
        documents.map(async (doc) => {
          try {
            await index.insertItem({
              id: doc.id,
              vector: doc.embedding,
              metadata: {
                projectId: doc.projectId,
                knowledgeItemId: doc.knowledgeItemId,
                content: doc.content,
                category: doc.metadata?.category,
                type: doc.metadata?.type,
                size: doc.metadata?.size,
                addedAt: doc.metadata?.addedAt,
                chunkIndex: doc.metadata?.chunkIndex,
                totalChunks: doc.metadata?.totalChunks,
              },
            });
            return doc.id;
          } catch (error) {
            logger.warn('vector', `insertItem failed ${doc.id}`, error);
            return null;
          }
        }),
      );
      const ids = inserted.filter((id): id is string => id !== null);
      return { success: true, ids };
    } catch (e) {
      logger.error('vector', 'addDocuments failed', e);
      return { success: false, error: errorMessage(e) };
    }
  });

  ipcMain.handle(IPC.vector.updateDocument, async (_event, projectId: string, document: VectorDocumentInput): Promise<IpcResult> => {
    try {
      assertProjectId(projectId);
      assertDocument(document);
      const index = await service.getIndex(projectId);
      // Vectra 无原地更新：先删后插
      await index.deleteItem(document.id).catch((e: unknown) => logger.warn('vector', `Failed to delete before update ${document.id}: ${errorMessage(e)}`));
      await index.insertItem({
        id: document.id,
        vector: document.embedding,
        metadata: {
          projectId: document.projectId,
          knowledgeItemId: document.knowledgeItemId,
          content: document.content,
          category: document.metadata?.category,
          type: document.metadata?.type,
          size: document.metadata?.size,
          addedAt: document.metadata?.addedAt,
          chunkIndex: document.metadata?.chunkIndex,
          totalChunks: document.metadata?.totalChunks,
        },
      });
      return { success: true };
    } catch (e) {
      logger.error('vector', 'updateDocument failed', e);
      return { success: false, error: errorMessage(e) };
    }
  });

  ipcMain.handle(IPC.vector.deleteDocuments, async (_event, projectId: string, documentIds: string[]): Promise<IpcResult> => {
    try {
      assertProjectId(projectId);
      assertStringList(documentIds);
      const index = await service.getIndex(projectId);
      let failed = 0;
      for (const id of documentIds) {
        try {
          await index.deleteItem(id);
        } catch (e) {
          failed += 1;
          logger.warn('vector', `Failed to delete document ${id}: ${errorMessage(e)}`);
        }
      }
      return failed === 0 ? { success: true } : { success: false, error: `delete-failed:${failed}` };
    } catch (e) {
      logger.error('vector', 'deleteDocuments failed', e);
      return { success: false, error: errorMessage(e) };
    }
  });

  ipcMain.handle(
    IPC.vector.semanticSearch,
    async (_event, projectId: string, queryEmbedding: number[], options: { limit?: number } = {}): Promise<IpcResult> => {
      try {
        assertProjectId(projectId);
        assertEmbedding(queryEmbedding);
        const limit = Math.min(Math.max(1, Math.floor(options.limit ?? 10)), MAX_SEARCH_LIMIT);
        const index = await service.getIndex(projectId);
        const results = await index.queryItems(queryEmbedding, '', limit);
        return {
          success: true,
          results: results.map((r) => itemToSearchResult(r.item as VectraItem, r.score, projectId)),
        };
      } catch (e) {
        logger.error('vector', 'semanticSearch failed', e);
        return { success: false, error: errorMessage(e), results: [] };
      }
    },
  );

  ipcMain.handle(IPC.vector.getStats, async (_event, projectId: string): Promise<IpcResult> => {
    try {
      assertProjectId(projectId);
      const index = await service.getIndex(projectId);
      const items = await index.listItems();
      const categories: Record<string, number> = {};
      let dimensions = 384;
      for (const item of items) {
        const category = String((item.metadata as VectorDocumentMetadata | undefined)?.category ?? 'unknown');
        categories[category] = (categories[category] ?? 0) + 1;
        if (item.vector && item.vector.length > 0) {
          dimensions = item.vector.length;
        }
      }
      return {
        success: true,
        stats: { count: items.length, dimensions, categories, lastUpdated: Date.now() },
      };
    } catch (e) {
      logger.error('vector', 'getStats failed', e);
      return { success: false, error: errorMessage(e) };
    }
  });

  ipcMain.handle(IPC.vector.cleanup, async (_event, projectId: string): Promise<IpcResult> => {
    try {
      assertProjectId(projectId);
      const index = await service.getIndex(projectId);
      const items = await index.listItems();
      for (const item of items) {
        await index.deleteItem(item.id).catch((e: unknown) => logger.warn('vector', `Failed to delete item ${item.id}: ${errorMessage(e)}`));
      }
      service.forget(projectId);
      return { success: true };
    } catch (e) {
      logger.error('vector', 'cleanup failed', e);
      return { success: false, error: errorMessage(e) };
    }
  });

  ipcMain.handle(IPC.vector.checkConsistency, async (_event, projectId: string): Promise<IpcResult> => {
    try {
      assertProjectId(projectId);
      const index = await service.getIndex(projectId);
      const items = await index.listItems();
      const conflicts: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high'; suggestion: string }> = [];
      let dimensions = 384;

      for (const item of items) {
        const meta = item.metadata as (VectorDocumentMetadata & { projectId?: string }) | undefined;
        if (item.vector && item.vector.length > 0) {
          dimensions = item.vector.length;
        }
        if (!meta || (meta.projectId && meta.projectId !== projectId)) {
          conflicts.push({
            type: 'metadata_inconsistency',
            description: `文档${item.id}的projectId不匹配`,
            severity: 'high',
            suggestion: '修复或重新添加该文档',
          });
        }
        if (!item.vector || item.vector.length === 0) {
          conflicts.push({
            type: 'missing_embedding',
            description: `文档${item.id}缺少嵌入向量`,
            severity: 'high',
            suggestion: '重新生成该文档的嵌入向量',
          });
        }
      }

      if (dimensions !== 384 && dimensions !== 1024) {
        conflicts.push({
          type: 'embedding_dimension_unusual',
          description: `嵌入维度为${dimensions}，常见值为384或1024`,
          severity: 'low',
          suggestion: '如使用非标准模型，可忽略此警告',
        });
      }

      return {
        success: true,
        result: {
          isConsistent: conflicts.length === 0,
          conflicts,
          score: conflicts.length === 0 ? 1.0 : Math.max(0, 1 - conflicts.length * 0.1),
        },
      };
    } catch (e) {
      logger.error('vector', 'checkConsistency failed', e);
      return { success: false, error: errorMessage(e) };
    }
  });
}
