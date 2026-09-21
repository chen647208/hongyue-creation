/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { AppState, Project } from '../../shared/types';
import type { StorageRepository } from '../shared/services/repository';
import type { CommitOptions } from '../shared/services/repository/types';

/** 非项目配置切片键（settings + meta），用于差分持久化。 */
const NON_PROJECT_KEYS = [
  'models', 'prompts', 'cardPrompts', 'consistencyPrompts', 'consistencyCheckConfig',
  'embeddingModels', 'activeProjectId', 'activeModelId', 'activeEmbeddingModelId', 'language', 'theme',
  'uiFont', 'editorFont', 'customFonts', 'mcpServers',
  'uiFontSize', 'editorFontSize', 'editorLineHeight',
  'proxy', 'minimizeToTray', 'autoLaunch',
] as const;

export type PersistOp =
  | { kind: 'saveProject'; project: Project; opts?: CommitOptions }
  | { kind: 'deleteProject'; id: string }
  | { kind: 'saveSettings'; patch: Partial<AppState> };

/**
 * 计算两帧状态之间的持久化操作集（纯函数，便于测试）。
 *
 * 项目按 id 做引用比较：App 内所有项目更新都是不可变展开（改动的书必产生新引用，
 * 未改动的书保留原引用），因此引用不同即视为需要重写；id 消失即删除。
 * 配置切片按键做引用/值比较，仅把变化的键并入一个 saveSettings。
 * metaOf 把归因绑定到新引用上（见 projectStore.commitMetaOf）：调用方不传即默认 'user'。
 */
export function computePersistDiff(
  prev: AppState,
  next: AppState,
  metaOf?: (project: Project) => CommitOptions | undefined,
): PersistOp[] {
  const ops: PersistOp[] = [];

  const prevById = new Map(prev.projects.map((p) => [p.id, p]));
  const nextIds = new Set(next.projects.map((p) => p.id));
  for (const id of prevById.keys()) {
    if (!nextIds.has(id)) ops.push({ kind: 'deleteProject', id });
  }
  for (const p of next.projects) {
    if (prevById.get(p.id) !== p) {
      const op: PersistOp = { kind: 'saveProject', project: p };
      const opts = metaOf?.(p);
      if (opts) op.opts = opts;
      ops.push(op);
    }
  }

  const patch: Record<string, unknown> = {};
  let hasPatch = false;
  for (const key of NON_PROJECT_KEYS) {
    if (prev[key] !== next[key]) {
      patch[key] = next[key];
      hasPatch = true;
    }
  }
  if (hasPatch) ops.push({ kind: 'saveSettings', patch: patch as Partial<AppState> });

  return ops;
}

/**
 * 执行差分：把变化增量落到 repository（SQLite 走按行写，JSON 后端内部串行化）。串行保序：同书 revisions seq 依赖提交顺序。
 * 返回本次实际执行的操作集，供调用方在落盘成功后派发事件（如 chapter.save）。
 */
export async function persistDiff(
  repo: StorageRepository,
  prev: AppState,
  next: AppState,
  metaOf?: (project: Project) => CommitOptions | undefined,
): Promise<PersistOp[]> {
  const ops = computePersistDiff(prev, next, metaOf);
  for (const op of ops) {
    switch (op.kind) {
      case 'saveProject': await repo.saveProject(op.project, op.opts); break;
      case 'deleteProject': await repo.deleteProject(op.id); break;
      case 'saveSettings': await repo.saveSettings(op.patch); break;
    }
  }
  return ops;
}
