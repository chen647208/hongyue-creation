/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 按 bookId 查询视图定义并解析为注入范围（app 层组合 features/views 与 store）。
 * 注入时调用：确保通用模型 store 已按该书加载，再取当前选中视图投影。
 */
import type { ViewContextScope } from '@core/ai';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import type { Project } from '@shared/types';

import { buildViewContextScope } from '@/features/views/viewContext';
import { localStore } from '@/shared/services/localStore';

import { useGenericModelStore } from './stores/genericModelStore';

function readSelectedViewId(bookId: string): string | null {
  try {
    const raw = localStore.getItem(STORAGE_KEYS.viewsSelected);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[bookId] ?? null;
  } catch {
    return null;
  }
}

/**
 * 取当前选中视图的注入范围；本书无实体视图时返回 undefined。
 * store 未加载当前书时按 bookId 触发一次加载（repository 只在这里被 store 访问）。
 */
export async function loadViewContextScope(project: Project | null | undefined): Promise<ViewContextScope | undefined> {
  if (!project) return undefined;
  if (useGenericModelStore.getState().workId !== project.id || !useGenericModelStore.getState().loaded) {
    await useGenericModelStore.getState().load(project.id);
  }
  const views = useGenericModelStore.getState().views.filter(
    (view) => view.workId === project.id && view.viewType === 'entity',
  );
  if (views.length === 0) return undefined;
  const selected = readSelectedViewId(project.id);
  const active = views.find((view) => view.id === selected) ?? views[0];
  return active ? buildViewContextScope(project, active) : undefined;
}
