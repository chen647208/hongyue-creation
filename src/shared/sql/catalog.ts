/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * SQL 语句目录（唯一来源，docs/design/27 §2）。
 *
 * 渲染层只按 id 调用驱动；桌面主进程只执行本目录内的语句，未知 id 直接拒绝，
 * 从而关闭"渲染层可传任意 SQL"的通道。网页 wasm 驱动与测试夹具本地按 id 解析。
 */
export const SQL = {
  // ── schema 引导与版本 ──
  'schema.meta': `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  'schema.settings': `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  'schema.versionSelect': `SELECT value FROM meta WHERE key = 'schema_version'`,
  'schema.versionUpsert': `INSERT INTO meta(key, value) VALUES('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,

  // ── 迁移 v2（DROP 旧模型 + 六实体建表）──
  'migration.v2.dropChaptersFts': `DROP TABLE IF EXISTS chapters_fts`,
  'migration.v2.dropKnowledgeFts': `DROP TABLE IF EXISTS knowledge_fts`,
  'migration.v2.dropProjects': `DROP TABLE IF EXISTS projects`,
  'migration.v2.nodes': `CREATE TABLE IF NOT EXISTS nodes (
         id         TEXT PRIMARY KEY,
         book_id    TEXT NOT NULL,
         type       TEXT NOT NULL,
         title      TEXT NOT NULL,
         body       TEXT NOT NULL,
         path       TEXT,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         erased     INTEGER NOT NULL DEFAULT 0,
         hash       TEXT NOT NULL
       )`,
  'migration.v2.idxNodesBook': `CREATE INDEX IF NOT EXISTS idx_nodes_book ON nodes(book_id)`,
  'migration.v2.idxNodesType': `CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)`,
  'migration.v2.edges': `CREATE TABLE IF NOT EXISTS edges (
         id       TEXT PRIMARY KEY,
         from_id  TEXT NOT NULL,
         to_id    TEXT NOT NULL,
         kind     TEXT NOT NULL,
         role     TEXT,
         position REAL NOT NULL,
         book_id  TEXT NOT NULL,
         erased   INTEGER NOT NULL DEFAULT 0,
         hash     TEXT NOT NULL
       )`,
  'migration.v2.idxEdgesBook': `CREATE INDEX IF NOT EXISTS idx_edges_book ON edges(book_id)`,
  'migration.v2.idxEdgesFrom': `CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id)`,
  'migration.v2.attrs': `CREATE TABLE IF NOT EXISTS attrs (
         id          TEXT PRIMARY KEY,
         node_id     TEXT NOT NULL,
         type        TEXT NOT NULL,
         name        TEXT NOT NULL,
         value       TEXT NOT NULL,
         inheritable INTEGER NOT NULL DEFAULT 0,
         position    INTEGER NOT NULL,
         erased      INTEGER NOT NULL DEFAULT 0,
         hash        TEXT NOT NULL
       )`,
  'migration.v2.idxAttrsNode': `CREATE INDEX IF NOT EXISTS idx_attrs_node ON attrs(node_id)`,
  'migration.v2.revisions': `CREATE TABLE IF NOT EXISTS revisions (
         id         TEXT PRIMARY KEY,
         node_id    TEXT NOT NULL,
         seq        INTEGER NOT NULL,
         body       TEXT NOT NULL,
         author     TEXT NOT NULL,
         cause      TEXT,
         created_at INTEGER NOT NULL
       )`,
  'migration.v2.idxRevisionsNode': `CREATE INDEX IF NOT EXISTS idx_revisions_node ON revisions(node_id, seq)`,
  'migration.v2.attachments': `CREATE TABLE IF NOT EXISTS attachments (
         id      TEXT PRIMARY KEY,
         node_id TEXT NOT NULL,
         role    TEXT NOT NULL,
         mime    TEXT NOT NULL,
         blob_id TEXT NOT NULL,
         erased  INTEGER NOT NULL DEFAULT 0
       )`,
  'migration.v2.blobs': `CREATE TABLE IF NOT EXISTS blobs (
         id    TEXT PRIMARY KEY,
         bytes BLOB NOT NULL,
         enc   TEXT
       )`,
  // ── 迁移 v4（附件元数据列）──
  'migration.v4.attachmentsName': `ALTER TABLE attachments ADD COLUMN name TEXT`,
  'migration.v4.attachmentsSize': `ALTER TABLE attachments ADD COLUMN size INTEGER`,
  'migration.v4.attachmentsCreatedAt': `ALTER TABLE attachments ADD COLUMN created_at INTEGER`,
  // ── 迁移 v5（通用创作模型：实体类型/字段/顺序/视图）──
  'migration.v5.itemTypes': `CREATE TABLE IF NOT EXISTS item_types (
         id          TEXT PRIMARY KEY,
         work_id     TEXT,
         label       TEXT NOT NULL,
         icon        TEXT,
         color       TEXT,
         parent_type TEXT,
         builtin     INTEGER NOT NULL DEFAULT 0,
         erased      INTEGER NOT NULL DEFAULT 0,
         hash        TEXT NOT NULL
       )`,
  'migration.v5.fields': `CREATE TABLE IF NOT EXISTS fields (
         id            TEXT PRIMARY KEY,
         item_type_id  TEXT NOT NULL,
         key           TEXT NOT NULL,
         label         TEXT NOT NULL,
         data_type     TEXT NOT NULL,
         options       TEXT,
         required      INTEGER NOT NULL DEFAULT 0,
         default_value TEXT,
         order_index   INTEGER NOT NULL,
         erased        INTEGER NOT NULL DEFAULT 0,
         hash          TEXT NOT NULL
       )`,
  'migration.v5.sequenceItems': `CREATE TABLE IF NOT EXISTS sequence_items (
         id          TEXT PRIMARY KEY,
         work_id     TEXT NOT NULL,
         node_id     TEXT NOT NULL,
         parent_id   TEXT,
         order_index INTEGER NOT NULL,
         erased      INTEGER NOT NULL DEFAULT 0,
         hash        TEXT NOT NULL
       )`,
  'migration.v5.views': `CREATE TABLE IF NOT EXISTS views (
         id          TEXT PRIMARY KEY,
         work_id     TEXT NOT NULL,
         name        TEXT NOT NULL,
         view_type   TEXT NOT NULL,
         config      TEXT NOT NULL,
         order_index INTEGER NOT NULL,
         erased      INTEGER NOT NULL DEFAULT 0,
         hash        TEXT NOT NULL
       )`,
  'migration.v5.idxFieldsType': `CREATE INDEX IF NOT EXISTS idx_fields_item_type ON fields(item_type_id)`,
  'migration.v5.idxSequenceWork': `CREATE INDEX IF NOT EXISTS idx_sequence_work ON sequence_items(work_id)`,
  'migration.v5.idxViewsWork': `CREATE INDEX IF NOT EXISTS idx_views_work ON views(work_id)`,
  'migration.v2.entityChanges': `CREATE TABLE IF NOT EXISTS entity_changes (
         id               INTEGER PRIMARY KEY AUTOINCREMENT,
         entity_name      TEXT NOT NULL,
         entity_id        TEXT NOT NULL,
         hash             TEXT NOT NULL,
         is_erased        INTEGER NOT NULL,
         instance_id      TEXT NOT NULL,
         agent_id         TEXT NOT NULL,
         utc_date_changed INTEGER NOT NULL
       )`,
  'migration.v2.idxChangesEntity': `CREATE INDEX IF NOT EXISTS idx_changes_entity ON entity_changes(entity_name, entity_id)`,
  'migration.v2.nodesFts': `CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
         book_id UNINDEXED,
         node_id UNINDEXED,
         type    UNINDEXED,
         title,
         content,
         tokenize = 'trigram'
       )`,

  // ── 迁移 v3 ──
  'migration.v3.idxEdgesTo': `CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id)`,

  // ── meta ──
  'meta.selectMigratedSentinel': `SELECT value FROM meta WHERE key = 'migrated_from_json'`,
  'meta.insertMigratedSentinel': `INSERT INTO meta(key, value) VALUES('migrated_from_json', '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  'meta.selectAll': `SELECT key, value FROM meta`,
  'meta.selectActiveProject': `SELECT value FROM meta WHERE key = 'activeProjectId'`,
  'meta.deleteActiveProject': `DELETE FROM meta WHERE key = 'activeProjectId'`,
  'meta.deleteKey': `DELETE FROM meta WHERE key = ?`,
  'meta.upsert': `INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  'meta.deleteKnownKeys': `DELETE FROM meta WHERE key IN ('activeProjectId','activeModelId','activeEmbeddingModelId','language','theme','uiFont','editorFont')`,

  // ── settings ──
  'settings.selectAll': `SELECT key, value FROM settings`,
  'settings.selectConsistencyConfig': `SELECT value FROM settings WHERE key = 'consistencyCheckConfig'`,
  'settings.selectConsistencyPrompts': `SELECT value FROM settings WHERE key = 'consistencyPrompts'`,
  'settings.deleteKey': `DELETE FROM settings WHERE key = ?`,
  'settings.upsert': `INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  'settings.deleteAll': `DELETE FROM settings`,

  // ── nodes ──
  'nodes.selectAll': `SELECT * FROM nodes`,
  'nodes.selectDistinctBooks': `SELECT DISTINCT book_id FROM nodes`,
  'nodes.selectHashesByBook': `SELECT id, hash, body FROM nodes WHERE book_id = ?`,
  'nodes.deleteById': `DELETE FROM nodes WHERE id = ?`,
  'nodes.updateUpdatedAt': `UPDATE nodes SET updated_at = ? WHERE id = ?`,
  'nodes.upsert': `INSERT INTO nodes(id, book_id, type, title, body, path, created_at, updated_at, erased, hash)
         VALUES(?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           book_id=excluded.book_id, type=excluded.type, title=excluded.title, body=excluded.body,
           path=excluded.path, created_at=excluded.created_at, updated_at=excluded.updated_at,
           erased=excluded.erased, hash=excluded.hash`,
  'nodes.deleteByBook': `DELETE FROM nodes WHERE book_id = ?`,
  'nodes.selectIdsByBook': `SELECT id FROM nodes WHERE book_id = ?`,
  'nodes.deleteAll': `DELETE FROM nodes`,

  // ── edges ──
  'edges.selectAll': `SELECT * FROM edges`,
  'edges.selectHashesByBook': `SELECT id, hash FROM edges WHERE book_id = ?`,
  'edges.deleteById': `DELETE FROM edges WHERE id = ?`,
  'edges.upsert': `INSERT INTO edges(id, from_id, to_id, kind, role, position, book_id, erased, hash)
         VALUES(?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           from_id=excluded.from_id, to_id=excluded.to_id, kind=excluded.kind, role=excluded.role,
           position=excluded.position, book_id=excluded.book_id, erased=excluded.erased, hash=excluded.hash`,
  'edges.deleteByBook': `DELETE FROM edges WHERE book_id = ?`,
  'edges.selectIdsByBook': `SELECT id FROM edges WHERE book_id = ?`,
  'edges.deleteAll': `DELETE FROM edges`,

  // ── attrs ──
  'attrs.selectAllWithBook': `SELECT a.*, n.book_id FROM attrs a JOIN nodes n ON a.node_id = n.id`,
  'attrs.selectHashesByBook': `SELECT a.id, a.hash FROM attrs a JOIN nodes n ON a.node_id = n.id WHERE n.book_id = ?`,
  'attrs.deleteById': `DELETE FROM attrs WHERE id = ?`,
  'attrs.upsert': `INSERT INTO attrs(id, node_id, type, name, value, inheritable, position, erased, hash)
         VALUES(?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           node_id=excluded.node_id, type=excluded.type, name=excluded.name, value=excluded.value,
           inheritable=excluded.inheritable, position=excluded.position, erased=excluded.erased, hash=excluded.hash`,
  'attrs.deleteByBook': `DELETE FROM attrs WHERE node_id IN (SELECT id FROM nodes WHERE book_id = ?)`,
  'attrs.selectIdsByBook': `SELECT a.id FROM attrs a JOIN nodes n ON a.node_id = n.id WHERE n.book_id = ?`,
  'attrs.deleteAll': `DELETE FROM attrs`,

  // ── revisions ──
  'revisions.selectByNode': `SELECT id, node_id, seq, body, author, cause, created_at FROM revisions WHERE node_id = ? ORDER BY seq ASC`,
  'revisions.selectMaxSeqByBook': `SELECT r.node_id, MAX(r.seq) AS max FROM revisions r
        WHERE r.node_id IN (SELECT id FROM nodes WHERE book_id = ?) GROUP BY r.node_id`,
  'revisions.insert': `INSERT INTO revisions(id, node_id, seq, body, author, cause, created_at) VALUES(?,?,?,?,?,?,?)`,
  'revisions.deleteAll': `DELETE FROM revisions`,
  'revisions.selectRecentByBook': `SELECT r.id, r.node_id, r.author, r.cause, r.created_at, substr(r.body, 1, 120) AS preview
         FROM revisions r JOIN nodes n ON n.id = r.node_id
         WHERE n.book_id = ? ORDER BY r.created_at DESC, r.seq DESC LIMIT ?`,
  'revisions.selectStatsByBook': `SELECT r.node_id, r.created_at, length(r.body) AS len
         FROM revisions r JOIN nodes n ON n.id = r.node_id
         WHERE n.book_id = ? ORDER BY r.created_at ASC, r.seq ASC`,

  // ── entity_changes ──
  'changes.insert': `INSERT INTO entity_changes(entity_name, entity_id, hash, is_erased, instance_id, agent_id, utc_date_changed)
         VALUES(?,?,?,?,?,?,?)`,
  'changes.deleteAll': `DELETE FROM entity_changes`,
  'changes.selectRecent': `SELECT id, entity_name, entity_id, is_erased, agent_id, utc_date_changed
         FROM entity_changes ORDER BY id DESC LIMIT ?`,

  // ── 附件 / 二进制 ──
  'attachments.deleteAll': `DELETE FROM attachments`,
  'attachments.selectByNode': `SELECT id, node_id, role, mime, blob_id, name, size, created_at FROM attachments WHERE node_id = ? AND erased = 0 ORDER BY created_at DESC`,
  'attachments.selectById': `SELECT id, node_id, role, mime, blob_id, name, size, created_at, erased FROM attachments WHERE id = ?`,
  'attachments.insert': `INSERT INTO attachments (id, node_id, role, mime, blob_id, erased, name, size, created_at) VALUES (?,?,?,?,?,0,?,?,?)`,
  'attachments.markErased': `UPDATE attachments SET erased = 1 WHERE id = ?`,
  'blobs.deleteAll': `DELETE FROM blobs`,
  'blobs.insert': `INSERT OR REPLACE INTO blobs (id, bytes, enc) VALUES (?,?,NULL)`,
  'blobs.selectById': `SELECT bytes FROM blobs WHERE id = ?`,
  'blobs.delete': `DELETE FROM blobs WHERE id = ?`,

  // ── 通用创作模型：实体类型 / 字段 / 顺序 / 视图 ──
  'itemTypes.selectAll': `SELECT id, work_id, label, icon, color, parent_type, builtin FROM item_types WHERE erased = 0 ORDER BY builtin DESC, label ASC`,
  'itemTypes.selectByWork': `SELECT id, work_id, label, icon, color, parent_type, builtin FROM item_types WHERE erased = 0 AND (work_id IS NULL OR work_id = ?) ORDER BY builtin DESC, label ASC`,
  'itemTypes.upsert': `INSERT INTO item_types (id, work_id, label, icon, color, parent_type, builtin, erased, hash) VALUES (?,?,?,?,?,?,?,0,?)
         ON CONFLICT(id) DO UPDATE SET work_id=excluded.work_id, label=excluded.label, icon=excluded.icon, color=excluded.color, parent_type=excluded.parent_type, builtin=excluded.builtin, erased=0, hash=excluded.hash`,
  'itemTypes.markErased': `UPDATE item_types SET erased = 1 WHERE id = ?`,
  'itemTypes.deleteAll': `DELETE FROM item_types`,
  'fields.selectByType': `SELECT id, item_type_id, key, label, data_type, options, required, default_value, order_index FROM fields WHERE item_type_id = ? AND erased = 0 ORDER BY order_index ASC`,
  'fields.upsert': `INSERT INTO fields (id, item_type_id, key, label, data_type, options, required, default_value, order_index, erased, hash) VALUES (?,?,?,?,?,?,?,?,?,0,?)
         ON CONFLICT(id) DO UPDATE SET item_type_id=excluded.item_type_id, key=excluded.key, label=excluded.label, data_type=excluded.data_type, options=excluded.options, required=excluded.required, default_value=excluded.default_value, order_index=excluded.order_index, erased=0, hash=excluded.hash`,
  'fields.markErased': `UPDATE fields SET erased = 1 WHERE id = ?`,
  'fields.deleteAll': `DELETE FROM fields`,
  'sequence.selectByWork': `SELECT id, work_id, node_id, parent_id, order_index FROM sequence_items WHERE work_id = ? AND erased = 0 ORDER BY order_index ASC`,
  'sequence.insert': `INSERT INTO sequence_items (id, work_id, node_id, parent_id, order_index, erased, hash) VALUES (?,?,?,?,?,0,?)`,
  'sequence.deleteByWork': `DELETE FROM sequence_items WHERE work_id = ?`,
  'sequence.deleteAll': `DELETE FROM sequence_items`,
  'views.selectByWork': `SELECT id, work_id, name, view_type, config, order_index FROM views WHERE work_id = ? AND erased = 0 ORDER BY order_index ASC`,
  'views.upsert': `INSERT INTO views (id, work_id, name, view_type, config, order_index, erased, hash) VALUES (?,?,?,?,?,?,0,?)
         ON CONFLICT(id) DO UPDATE SET work_id=excluded.work_id, name=excluded.name, view_type=excluded.view_type, config=excluded.config, order_index=excluded.order_index, erased=0, hash=excluded.hash`,
  'views.markErased': `UPDATE views SET erased = 1 WHERE id = ?`,
  'views.deleteAll': `DELETE FROM views`,

  // ── 全文检索 ──
  'fts.deleteByNode': `DELETE FROM nodes_fts WHERE node_id = ?`,
  'fts.insert': `INSERT INTO nodes_fts(book_id, node_id, type, title, content) VALUES(?,?,?,?,?)`,
  'fts.deleteByBook': `DELETE FROM nodes_fts WHERE book_id = ?`,
  'fts.deleteAll': `DELETE FROM nodes_fts`,
  'fts.search': `SELECT book_id, node_id, type, title,
              snippet(nodes_fts, 4, '[', ']', '…', 16) AS snip, rank
         FROM nodes_fts
        WHERE nodes_fts MATCH ? AND (? IS NULL OR book_id = ?)
        ORDER BY rank LIMIT ?`,

  // ── 维护（引擎内置，供 wasm 驱动本地调用）──
  'engine.quickCheck': `PRAGMA quick_check`,
  'engine.vacuum': `VACUUM`,
  'engine.reindex': `REINDEX`,
  'engine.begin': `BEGIN`,
  'engine.commit': `COMMIT`,
  'engine.rollback': `ROLLBACK`,
} as const;

/** 语句标识：调用方只能引用目录内的 id。 */
export type SqlId = keyof typeof SQL;
