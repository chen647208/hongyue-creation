/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { entitiesToProject, projectToEntities } from '@core/project';
import type { Project } from '@shared/types';
import { describe, expect,it } from 'vitest';

import { buildProjectBranchView, projectBranchData, validateProjectBranching } from '../branchView';
import { buildEntityView } from '../buildEntityView';
import { buildComparisonView } from '../comparisonView';

function branchProject(): Project {
  return {
    id: 'p1',
    title: '分支之书',
    inspiration: '',
    intro: '',
    outline: '',
    characters: [],
    chapters: [],
    virtualChapters: [],
    knowledge: [],
    lastModified: 0,
    branching: {
      startId: 's1',
      variables: [{ name: 'flag', type: 'number' }],
      scenes: [
        { id: 's1', title: '开场', choices: [{ text: '去A', target: 's2' }, { text: '隐藏', target: 's2', condition: 'missing > 0' }] },
        { id: 's2', title: '结局', ending: true },
        { id: 's9', title: '孤儿' },
      ],
    },
  };
}

describe('分支模型接入 Project', () => {
  it('从 Project.branching 投影场景与变量并校验', () => {
    const data = projectBranchData(branchProject());
    expect(data.scenes).toHaveLength(3);
    expect(data.startId).toBe('s1');
    const kinds = validateProjectBranching(branchProject()).map((issue) => issue.kind);
    expect(kinds).toContain('orphan');
    expect(kinds).toContain('undefinedVariable');
  });

  it('分支视图行与跳转边取自真实数据', () => {
    const view = buildProjectBranchView(branchProject());
    expect(view.rows.map((row) => row.id)).toEqual(['s1', 's2', 's9']);
    expect(view.rows.find((row) => row.id === 's9')?.cells.detail).toContain('orphan');
    expect(view.links).toContainEqual({ source: 's1', target: 's2', label: '去A' });
  });

  it('实体视图包含分支场景行与选择项边', () => {
    const { rows, links } = buildEntityView(branchProject());
    expect(rows.filter((row) => row.kind === 'branch-scene')).toHaveLength(3);
    expect(links).toContainEqual({ source: 's1', target: 's2', label: '去A' });
  });

  it('分支模型经六实体投影往返无损', () => {
    const original = branchProject();
    const restored = entitiesToProject(projectToEntities(original, 10));
    expect(restored.branching).toEqual(original.branching);
  });

  it('绘本页经六实体投影往返无损', () => {
    const original: Project = {
      ...branchProject(),
      pictureBook: { pages: [{ id: 'p1', title: '第一页', imageId: 'a.png', text: '文字' }] },
    };
    const restored = entitiesToProject(projectToEntities(original, 10));
    expect(restored.pictureBook).toEqual(original.pictureBook);
  });
});

describe('对照视图投影', () => {
  const project: Project = {
    ...branchProject(),
    translation: {
      pairs: [
        { id: 'pair:1', source: '原文一', target: '译文一', confirmed: true },
        { id: 'pair:2', source: '原文二', target: '译文二', confirmed: false },
      ],
    },
  };

  it('段落成行，确认状态进 values', () => {
    const view = buildComparisonView(project.translation);
    expect(view.rows.map((row) => row.kind)).toEqual(['translation-pair', 'translation-pair']);
    expect(view.rows[0]?.cells).toMatchObject({ source: '原文一', target: '译文一', confirmed: '✓' });
    expect(view.rows[0]?.values?.confirmed).toBe(true);
  });

  it('实体视图含对照行', () => {
    const { rows } = buildEntityView(project);
    expect(rows.filter((row) => row.kind === 'translation-pair')).toHaveLength(2);
  });

  it('对照侧车经六实体投影往返无损', () => {
    const restored = entitiesToProject(projectToEntities(project, 10));
    expect(restored.translation).toEqual(project.translation);
  });
});
