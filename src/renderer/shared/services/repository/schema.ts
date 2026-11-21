/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { SqlId } from '../../../../shared/sql/catalog';
import type { SqlDriver } from './types';

/**
 * 数据库 schema 与迁移（v2 六实体）。DDL 文本统一在 `shared/sql/catalog.ts`（唯一来源）；
 * 本文件只声明版本、迁移顺序与键集合，桌面(better-sqlite3)与网页(wa-sqlite via OPFS)共用。
 *
 * 每个实体表带 hash 列：变更检测缓存，saveProject 时与旧行比对，仅真实变化才写 entity_changes。
 */

export const SCHEMA_VERSION = 5;

/** settings 表里以 JSON 存储的非项目配置切片键 */
export const SETTING_KEYS = [
  'models',
  'prompts',
  'cardPrompts',
  'consistencyPrompts',
  'consistencyCheckConfig',
  'embeddingModels',
  'customFonts',
  'tts',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** meta 表里以标量存储的键 */
export const META_KEYS = ['activeProjectId', 'activeModelId', 'activeEmbeddingModelId', 'language', 'theme', 'uiFont', 'editorFont'] as const;
export type MetaKey = (typeof META_KEYS)[number];

/** 迁移脚本：version 为应用该脚本后达到的版本；语句按 catalog id 引用。 */
export const MIGRATIONS: ReadonlyArray<{ version: number; up: readonly SqlId[] }> = [
  {
    version: 2,
    up: [
      'migration.v2.dropChaptersFts',
      'migration.v2.dropKnowledgeFts',
      'migration.v2.dropProjects',
      'migration.v2.nodes',
      'migration.v2.idxNodesBook',
      'migration.v2.idxNodesType',
      'migration.v2.edges',
      'migration.v2.idxEdgesBook',
      'migration.v2.idxEdgesFrom',
      'migration.v2.attrs',
      'migration.v2.idxAttrsNode',
      'migration.v2.revisions',
      'migration.v2.idxRevisionsNode',
      'migration.v2.attachments',
      'migration.v2.blobs',
      'migration.v2.entityChanges',
      'migration.v2.idxChangesEntity',
      'migration.v2.nodesFts',
    ],
  },
  {
    version: 3,
    up: ['migration.v3.idxEdgesTo'],
  },
  {
    version: 4,
    up: ['migration.v4.attachmentsName', 'migration.v4.attachmentsSize', 'migration.v4.attachmentsCreatedAt'],
  },
  {
    version: 5,
    up: [
      'migration.v5.itemTypes',
      'migration.v5.fields',
      'migration.v5.sequenceItems',
      'migration.v5.views',
      'migration.v5.idxFieldsType',
      'migration.v5.idxSequenceWork',
      'migration.v5.idxViewsWork',
    ],
  },
];

/**
 * 将数据库迁移到最新 schema。幂等：已应用的版本会被跳过。
 * 每条迁移脚本在一个事务内执行，并写入 schema_version。
 */
export async function migrate(driver: SqlDriver): Promise<void> {
  await driver.exec('schema.meta');
  await driver.exec('schema.settings');
  const row = await driver.get<{ value: string }>('schema.versionSelect');
  const current = row ? Number(row.value) : 0;

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    await driver.transaction(async (tx) => {
      for (const id of m.up) {
        await tx.exec(id);
      }
      await tx.run('schema.versionUpsert', [String(m.version)]);
    });
  }
}
