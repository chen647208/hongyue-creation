/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 条件树的结构助手：在任意深度的 and/or/not 树上增删节点。
 * 面板对已有或/非树只做增量编辑：增删命中哪个节点就改哪个节点，
 * 未被命中的分支原样保留，不把整棵树拍平成平铺 AND。
 */
import type { ConditionOperator, QueryCondition, QueryGroup, QueryLeaf } from './types';

/** 条件分组类型（与、或、非；不含叶子）。 */
export type ConditionGroupType = QueryGroup['type'];

/** 按文档顺序收集全部叶子：空态提示与「删空即撤组」都以此顺序为准。 */
export function collectConditionLeaves(condition: QueryCondition | undefined): QueryLeaf[] {
  if (!condition) return [];
  if (condition.type === 'leaf') return [condition];
  return condition.children.flatMap((child) => collectConditionLeaves(child));
}

/** 由面板的三个输入组装叶子：empty/notEmpty 不写比较值。 */
export function makeConditionLeaf(field: string, operator: ConditionOperator, value: string): QueryLeaf {
  const leaf: QueryLeaf = { type: 'leaf', field, operator };
  if (operator !== 'empty' && operator !== 'notEmpty') leaf.value = value;
  return leaf;
}

/**
 * 在 path 指向的分组内追加子条件；path 为空指向根分组。
 * 根分组缺席时：追加叶子 → 新建 and 根分组承载该叶子（与平铺 AND 配置一致）；
 * 追加分组 → 该分组直接作为根分组（避免 and 根包住一个空 or 分组把全部行过滤掉）。
 */
export function insertConditionAt(
  condition: QueryCondition | undefined,
  path: readonly number[],
  child: QueryCondition,
): QueryCondition {
  if (!condition) return child.type === 'leaf' ? { type: 'and', children: [child] } : child;
  if (condition.type === 'leaf') return condition;
  if (path.length === 0) return { type: condition.type, children: [...condition.children, child] };
  const [index, ...rest] = path;
  const children = condition.children.map((item, position) =>
    position === index ? insertConditionAt(item, rest, child) : item,
  );
  return { type: condition.type, children };
}

/**
 * 删除 path 指向的节点（path 为空删整棵树）。
 * 分组被删空后随父级一并移除，避免留下让全部行过滤出去的空 or 分组；
 * 根分组删空返回 undefined，即回到「无筛选条件」。
 */
export function removeConditionAt(
  condition: QueryCondition | undefined,
  path: readonly number[],
): QueryCondition | undefined {
  if (!condition || condition.type === 'leaf' || path.length === 0) return undefined;
  const [index, ...rest] = path;
  const next = condition.children.map((child, position) => {
    if (position !== index) return child;
    return rest.length === 0 ? undefined : removeConditionAt(child, rest);
  });
  const kept = next.filter((child): child is QueryCondition => child !== undefined);
  return kept.length > 0 ? { type: condition.type, children: kept } : undefined;
}
