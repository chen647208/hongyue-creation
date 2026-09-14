/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 分支叙事视图投影（docs/design/42 §4）：场景为行、选择项为边，
 * 复用 EntityViewData，可直接用既有表格/卡片/关系图视图呈现。
 * 只做投影，不执行分支——运行时执行由下游引擎负责。
 */
import type { BranchIssue, BranchScene, BranchVariable } from '@core/build';
import { buildJumpTable, validateBranching } from '@core/build';
import type { BranchingModel } from '@shared/types';

import type { EntityViewData, ViewColumn, ViewLink, ViewRow } from './types';

export const BRANCH_VIEW_COLUMNS: ViewColumn[] = [
  { key: 'kind', label: 'views.col.kind', width: 96 },
  { key: 'title', label: 'views.col.title', width: 180 },
  { key: 'summary', label: 'views.col.summary', width: 220 },
  { key: 'detail', label: 'views.col.detail', width: 280 },
];

/** 场景集合 → 视图行与跳转边；问题标签写入 detail，供表格/卡片直接显示。 */
export function buildBranchView(
  scenes: readonly BranchScene[],
  variables: readonly BranchVariable[] = [],
  startId?: string,
): EntityViewData {
  const issues = validateBranching(scenes, variables, startId);
  const issuesByScene = new Map<string, string[]>();
  for (const issue of issues) {
    const list = issuesByScene.get(issue.sceneId) ?? [];
    list.push(issue.kind);
    issuesByScene.set(issue.sceneId, list);
  }

  const rows: ViewRow[] = scenes.map((scene) => {
    const choices = scene.choices ?? [];
    const problem = issuesByScene.get(scene.id) ?? [];
    const kind = scene.ending ? 'ending' : 'scene';
    return {
      id: scene.id,
      kind: 'branch-scene',
      title: scene.title,
      cells: {
        kind,
        title: scene.title,
        summary: `${choices.length}`,
        detail: problem.join(', '),
      },
      values: {
        kind,
        title: scene.title,
        name: scene.title,
        choiceCount: choices.length,
        ending: scene.ending === true,
        issues: problem.join(','),
      },
    };
  });

  const links: ViewLink[] = [];
  const known = new Set(scenes.map((scene) => scene.id));
  for (const jump of buildJumpTable(scenes)) {
    if (known.has(jump.target)) links.push({ source: jump.fromId, target: jump.target, label: jump.choice });
  }

  return { columns: BRANCH_VIEW_COLUMNS, rows, links };
}

/** 真实数据入口：从 Project.branching 取场景、变量与起点。 */
export interface ProjectBranchData {
  scenes: BranchScene[];
  variables: BranchVariable[];
  startId?: string;
}

export function projectBranchData(project: { branching?: BranchingModel }): ProjectBranchData {
  const model = project.branching;
  const data: ProjectBranchData = {
    scenes: model?.scenes ?? [],
    variables: model?.variables ?? [],
  };
  if (model?.startId) data.startId = model.startId;
  return data;
}

/** 校验 Project 上的分支模型，问题供视图跳转定位。 */
export function validateProjectBranching(project: { branching?: BranchingModel }): BranchIssue[] {
  const { scenes, variables, startId } = projectBranchData(project);
  return validateBranching(scenes, variables, startId);
}

/** 从 Project 直接投影分支视图（真实数据）。 */
export function buildProjectBranchView(project: { branching?: BranchingModel }): EntityViewData {
  const { scenes, variables, startId } = projectBranchData(project);
  return buildBranchView(scenes, variables, startId);
}
