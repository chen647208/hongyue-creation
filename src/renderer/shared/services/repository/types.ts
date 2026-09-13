/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { RevisionEntity } from '@core/entities';

import type { SqlId } from '../../../../shared/sql/catalog';
import type {
  AppState,
  ConsistencyCheckConfig,
  ConsistencyCheckPromptTemplate,
  Project,
  StorageConfig,
} from '../../../../shared/types';

/** 提交选项：标注变更来源与触发原因（单一事务管线的 agentId 维度） */
export interface CommitOptions {
  /** 'user'（默认）或 'ai:<tool>'；写入 entity_changes.agent_id 与 revisions.author */
  agentId?: string;
  /** 触发正文变更的 toolCallId/commandId，写入 revisions.cause */
  cause?: string;
}

/**
 * SQL 驱动抽象 —— repository 逻辑只依赖这一层，桌面(better-sqlite3 via IPC)
 * 与网页(wa-sqlite via OPFS)各实现一份，schema 与查询语句两端共用。
 *
 * 约定：所有语句的值一律走 params 绑定，调用方不得拼接用户输入进 SQL 文本。
 */
export type SqlValue = string | number | bigint | null | Uint8Array;

export interface SqlRunResult {
  changes: number;
  lastInsertRowid: number;
}

/** 数据库加密状态（密钥文件存在 + 系统钥匙串可用性）。 */
export interface DbEncryptionStatus {
  enabled: boolean;
  available: boolean;
  weakBackend: boolean;
  backend: string;
}

export interface SqlDriver {
  /** 执行一条无返回语句（建表、PRAGMA、迁移等，按 catalog id） */
  exec(id: SqlId): Promise<void>;
  /** 执行写入语句，返回受影响行数与自增主键 */
  run(id: SqlId, params?: SqlValue[]): Promise<SqlRunResult>;
  /** 查询多行 */
  all<T = Record<string, SqlValue>>(id: SqlId, params?: SqlValue[]): Promise<T[]>;
  /** 查询单行 */
  get<T = Record<string, SqlValue>>(id: SqlId, params?: SqlValue[]): Promise<T | undefined>;
  /** 事务：回调内的所有写操作原子提交，抛错则回滚 */
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;
  /** 快速完整性检查（桌面 better-sqlite3 支持；无此能力的后端可省略） */
  integrityCheck?(): Promise<{ ok: boolean; result: string }>;
  /** 深度完整性检查（逐页校验，维护用） */
  fullIntegrityCheck?(): Promise<{ ok: boolean; result: string }>;
  /** 热备份（VACUUM INTO 一致副本，桌面 better-sqlite3 支持；keep 为保留份数） */
  hotBackup?(keep?: number): Promise<{ ok: boolean; path?: string; bytes?: number; error?: string }>;
  /** 维护：压缩 + 重建索引 */
  maintenance?(): Promise<void>;
  /** 数据库加密状态（桌面 better-sqlite3-multiple-ciphers 支持） */
  encryptionStatus?(): Promise<DbEncryptionStatus>;
  /** 启用库级加密，返回恢复码 */
  enableEncryption?(): Promise<{ ok: boolean; recoveryCode?: string; error?: string }>;
  /** 停用库级加密 */
  disableEncryption?(): Promise<{ ok: boolean; error?: string }>;
  /** 导出恢复码 */
  exportRecoveryKey?(): Promise<{ ok: boolean; code?: string; error?: string }>;
  /** 用恢复码解锁 */
  applyRecoveryKey?(code: string): Promise<{ ok: boolean; error?: string }>;
  /** 关闭连接 */
  close(): Promise<void>;
}

/**
 * 全文检索命中项（章节正文 / 知识库条目）。
 */
export interface SearchHit {
  scope: 'chapter' | 'knowledge';
  projectId: string;
  /** chapter_id 或 knowledge item_id */
  id: string;
  title?: string;
  category?: string;
  /** 带高亮标记的上下文片段 */
  snippet: string;
  /** FTS rank，越小越相关 */
  rank: number;
}

export interface SearchOptions {
  /** 限定在某本书内检索 */
  projectId?: string;
  /** 返回条数上限，默认 50 */
  limit?: number;
}

/** 文档附件元数据（二进制存 blobs，附件行存元信息；node 为书本实体 id）。 */
export interface AttachmentMeta {
  id: string;
  nodeId: string;
  role: string;
  mime: string;
  name: string;
  size: number;
  createdAt: number;
}

/** 修订统计行：某节点某次修订的正文长度与时间。 */
export interface RevisionStat {
  nodeId: string;
  createdAt: number;
  length: number;
}

/** 操作日志条目：一次正文修订，含作者（user / ai:<tool>）与触发原因。 */export interface OperationLogEntry {
  id: string;
  nodeId: string;
  actor: string;
  cause?: string;
  preview: string;
  createdAt: number;
}

/** 自定义字段的数据类型。 */
export type FieldDataType = 'text' | 'number' | 'date' | 'option' | 'checkbox' | 'relation' | 'image' | 'link' | 'tag';

/** 实体类型定义（内置类型 workId 为 null，用户类型属于某作品）。 */
export interface ItemTypeDefinition {
  id: string;
  workId: string | null;
  label: string;
  icon?: string;
  color?: string;
  parentType?: string;
  builtin: boolean;
}

/** 挂在实体类型上的字段定义。 */
export interface FieldDefinition {
  id: string;
  itemTypeId: string;
  key: string;
  label: string;
  dataType: FieldDataType;
  options?: string[];
  required: boolean;
  defaultValue?: unknown;
  orderIndex: number;
}

/** 叙事顺序项：node 在作品内的呈现顺序，可嵌套分组（卷/幕）。 */
export interface SequenceItem {
  id: string;
  workId: string;
  nodeId: string;
  parentId: string | null;
  orderIndex: number;
}

/** 视图配置（同一数据多视图；config 由视图类型自行解释）。 */
export interface ViewDefinition {
  id: string;
  workId: string;
  name: string;
  viewType: string;
  config: Record<string, unknown>;
  orderIndex: number;
}

/**
 * 应用数据的唯一入口。UI/App 只依赖此接口，
 * 具体后端（JSON 文件 / SQLite）由 index.ts 按运行环境选择。
 *
 * Phase 0 先覆盖现有消费者用到的方法，保持零行为变更；
 * 增量写(saveProject/deleteProject)与检索(search)在后续阶段扩展。
 */
export interface StorageRepository {
  /**
   * 可选的后端初始化（建表迁移、首启从旧存储导入等）。
   * JSON 后端无需实现；SQLite 后端在首次 loadAll 前由 App 调用一次。
   */
  init?(): Promise<void>;
  /** 异步加载全量状态（Electron 走文件，浏览器走 localStorage） */
  loadAll(): Promise<AppState | null>;
  /** 同步读取（仅浏览器模式有效；Electron 返回 null，启动改用 loadAll） */
  loadAllSync(): AppState | null;
  /** 整体写入全量状态 */
  saveAll(state: AppState): Promise<void>;
  /** 清空全部数据 */
  clear(): Promise<void>;

  /** 快速完整性检查；后端不提供时返回 null。 */
  checkIntegrity?(): Promise<{ ok: boolean; result: string } | null>;
  /** 深度完整性检查（逐页校验）；后端不提供时返回 null。 */
  fullIntegrityCheck?(): Promise<{ ok: boolean; result: string } | null>;
  /** 热备份：生成数据库一致副本（桌面 better-sqlite3 支持；keep 为保留份数） */
  hotBackup?(keep?: number): Promise<{ ok: boolean; path?: string; bytes?: number; error?: string } | null>;
  /** 数据库加密状态；后端不支持时返回 null。 */
  encryptionStatus?(): Promise<DbEncryptionStatus | null>;
  /** 启用库级加密并返回恢复码；后端不支持时返回 null。 */
  enableEncryption?(): Promise<{ ok: boolean; recoveryCode?: string; error?: string } | null>;
  /** 停用库级加密。 */
  disableEncryption?(): Promise<{ ok: boolean; error?: string } | null>;
  /** 导出恢复码。 */
  exportRecoveryKey?(): Promise<{ ok: boolean; code?: string; error?: string } | null>;
  /** 用恢复码解锁数据库。 */
  applyRecoveryKey?(code: string): Promise<{ ok: boolean; error?: string } | null>;
  /** 压缩 + 重建索引。 */
  runMaintenance?(): Promise<void>;

  /**
   * 增量写入/更新单个项目（含其 FTS 索引刷新）。
   * opts.agentId 标注变更来源（'user' 或 'ai:<tool>'），写入 entity_changes 与 Revision；
   * opts.cause 记录触发本次正文变更的 toolCallId/commandId（AI 必留底）。
   */
  saveProject(project: Project, opts?: CommitOptions): Promise<void>;
  /** 删除单个项目（含其 FTS 索引） */
  deleteProject(id: string): Promise<void>;
  /** 仅写入给定的非项目配置切片 */
  saveSettings(patch: Partial<AppState>): Promise<void>;

  /**
   * 读取某节点的正文修订历史（按 seq 升序）。仅支持 Revision 的后端实现（SQLite）；
   * JSON 后端无修订概念，返回空数组。
   */
  loadRevisions?(nodeId: string): Promise<RevisionEntity[]>;

  /**
   * 读取某本书最近的操作日志（正文修订，按时间倒序）。仅 SQLite 后端提供；
   * 无修订概念的后端返回空数组。
   */
  loadOperationLog?(bookId: string, limit?: number): Promise<OperationLogEntry[]>;

  /** 读取某本书的修订统计（节点、时间、正文长度），用于码字日历。 */
  loadRevisionStats?(bookId: string): Promise<RevisionStat[]>;

  /** 全文检索（SQLite 走 FTS5；JSON 后端走内存过滤） */
  search(query: string, options?: SearchOptions): Promise<SearchHit[]>;

  /** 列出某节点未删除的文档附件（仅 SQLite 后端；JSON 后端不提供）。 */
  listAttachments?(nodeId: string): Promise<AttachmentMeta[]>;
  /** 保存文档附件：元数据与二进制分别落 attachments/blobs。 */
  saveAttachment?(input: { nodeId: string; role: string; mime: string; name: string; bytes: Uint8Array }): Promise<AttachmentMeta>;
  /** 读取附件二进制；不存在返回 null。 */
  loadAttachmentBytes?(id: string): Promise<Uint8Array | null>;
  /** 删除附件：标记 erased 并移除 blob。 */
  deleteAttachment?(id: string): Promise<void>;

  /** 列出实体类型：传 workId 时返回内置类型与该作者类型；不传返回全部内置。 */
  listItemTypes?(workId?: string): Promise<ItemTypeDefinition[]>;
  /** 写入实体类型（按 id upsert）。 */
  saveItemType?(itemType: ItemTypeDefinition): Promise<void>;
  /** 删除实体类型（标记 erased）。 */
  deleteItemType?(id: string): Promise<void>;
  /** 列出某实体类型的字段。 */
  listFields?(itemTypeId: string): Promise<FieldDefinition[]>;
  /** 写入字段（按 id upsert）。 */
  saveField?(field: FieldDefinition): Promise<void>;
  /** 删除字段（标记 erased）。 */
  deleteField?(id: string): Promise<void>;
  /** 列出作品的叙事顺序项。 */
  listSequence?(workId: string): Promise<SequenceItem[]>;
  /** 覆盖写入作品的叙事顺序（先删后插，单事务）。 */
  saveSequence?(workId: string, items: SequenceItem[]): Promise<void>;
  /** 列出作品的视图配置。 */
  listViews?(workId: string): Promise<ViewDefinition[]>;
  /** 写入视图配置（按 id upsert）。 */
  saveView?(view: ViewDefinition): Promise<void>;
  /** 删除视图配置（标记 erased）。 */
  deleteView?(id: string): Promise<void>;

  /** 导出全量数据（触发保存对话框 / 浏览器下载） */
  exportAll(state: AppState): Promise<void>;
  /** 导入全量数据（触发打开对话框），返回规范化后的状态 */
  importAll(): Promise<AppState>;
  /** 导出单本书 */
  exportBook(project: Project): Promise<void>;
  /** 导入单本书 */
  importBook(): Promise<Project>;

  /** 读取一致性检查配置 */
  loadConsistencyCheckConfig(): Promise<ConsistencyCheckConfig | null>;
  /** 读取一致性检查提示词模板 */
  loadConsistencyPrompts(): Promise<ConsistencyCheckPromptTemplate[] | null>;

  /** 读取存储子系统配置（路径、备份开关等） */
  getStorageConfig(): Promise<StorageConfig>;
  /** 更新存储子系统配置 */
  updateStorageConfig(config: StorageConfig): Promise<boolean>;
}
