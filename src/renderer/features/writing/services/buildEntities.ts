/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 项目 → 构建管线实体视图：导出与字数统计共用同一口径。
 * 与导出执行分文件，统计路径不为出版打包与渲染器付体积。
 */
import { referenceEntities } from '@core/build/references';
import type { AttributeEntity, EdgeEntity, NodeEntity } from '@core/entities';
import { builtinRegistry } from '@core/types-registry';

import { i18n } from '@/i18n';

import type { Project } from '../../../../shared/types';

/** Project.chapters → 构建管线实体视图（导出与统计共用，单一口径）。 */
export function projectToBuildEntities(project: Project): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  const nodes: NodeEntity[] = project.chapters.map((c) => ({
    id: c.id,
    bookId: project.id,
    type: 'novel.chapter',
    title: c.title,
    body: c.content || i18n.t('writing:export.noContent'),
    createdAt: 0,
    updatedAt: 0,
    erased: false,
  }));
  // 泛用分组/卷投影为 novel.part 节点：排序落在其首个成员章节之前，供类型级分卷识别。
  const groupNodes: NodeEntity[] = (project.groups ?? []).map((group) => ({
    id: group.id,
    bookId: project.id,
    type: 'novel.part',
    title: group.label,
    body: '',
    createdAt: 0,
    updatedAt: 0,
    erased: false,
  }));
  const groupAttrs: AttributeEntity[] = (project.groups ?? []).map((group, position) => {
    const memberOrders = project.chapters.filter((c) => c.groupId === group.id).map((c) => c.order);
    const order = memberOrders.length > 0 ? Math.min(...memberOrders) - 0.5 : group.order;
    return {
      id: `attr-order-${group.id}`,
      nodeId: group.id,
      type: 'label',
      name: 'order',
      value: String(order),
      inheritable: false,
      position,
      erased: false,
    };
  });
  const attrs: AttributeEntity[] = project.chapters.flatMap((c) => {
    const list: AttributeEntity[] = [{
      id: `attr-order-${c.id}`,
      nodeId: c.id,
      type: 'label',
      name: 'order',
      value: String(c.order),
      inheritable: false,
      position: 0,
      erased: false,
    }];
    if (c.material) {
      list.push({
        id: `attr-material-${c.id}`,
        nodeId: c.id,
        type: 'label',
        name: 'material',
        value: 'true',
        inheritable: false,
        position: 1,
        erased: false,
      });
    }
    return list;
  });
  // 来源条目投影为 meta.reference 节点：正文 [@key] 经编译管线解析为编号与文末表。
  const sources = referenceEntities(project.references ?? [], project.id);
  return {
    nodes: [...nodes, ...groupNodes, ...sources.nodes],
    attrs: [...attrs, ...groupAttrs, ...sources.attrs],
    edges: [],
  };
}

/** 导出对话框可分卷的类型候选：作品实际存在的正文节点类型（去掉来源与书根）。 */
export function listBuildContentTypes(project: Project): Array<{ type: string; label: string }> {
  const seen = new Set<string>();
  for (const node of projectToBuildEntities(project).nodes) {
    if (node.type === 'novel.book' || node.type.startsWith('meta.')) continue;
    seen.add(node.type);
  }
  return [...seen]
    .sort()
    .map((type) => ({ type, label: builtinRegistry.get(type)?.label ?? type }));
}
