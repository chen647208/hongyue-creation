/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Project, Reference } from '@shared/types';
import { describe, expect,it } from 'vitest';

import { buildBranchView } from '../branchView';
import { buildEntityView } from '../buildEntityView';

function reference(overrides: Partial<Reference> & Pick<Reference, 'id' | 'citekey' | 'title'>): Reference {
  return { type: 'book', ...overrides };
}

function projectWithReferences(): Project {
  return {
    id: 'p1',
    title: 'T',
    inspiration: '',
    intro: '',
    outline: '',
    virtualChapters: [],
    knowledge: [],
    lastModified: 0,
    characters: [],
    chapters: [
      { id: 'c1', title: '第一章', summary: '', content: '见 [@book1] 与 [@ghost]。', order: 0, status: 'draft' },
    ],
    references: [
      reference({ id: 'r1', citekey: 'book1', title: '第一本书', authors: '张三', year: '2001' }),
      reference({ id: 'r2', citekey: 'book2', title: '第二本书' }),
    ],
  };
}

describe('文献视图投影', () => {
  it('来源拍平为行，正文引文连到来源', () => {
    const { rows, links } = buildEntityView(projectWithReferences());
    const ref = rows.find((row) => row.id === 'r1');
    expect(ref?.kind).toBe('reference');
    expect(ref?.cells.summary).toBe('张三 · 2001');
    expect(links).toContainEqual({ source: 'c1', target: 'r1', label: 'cites' });
    expect(links.some((link) => link.target === 'ghost')).toBe(false);
  });
});

describe('分支视图投影', () => {
  it('场景与结局成行，选择项成边，问题写入 detail', () => {
    const scenes = [
      { id: 's1', title: '开场', choices: [{ text: '去A', target: 's2' }] },
      { id: 's2', title: '结局', ending: true },
      { id: 's9', title: '孤儿' },
    ];
    const { rows, links } = buildBranchView(scenes, [], 's1');
    expect(rows.map((row) => row.id)).toEqual(['s1', 's2', 's9']);
    expect(rows.find((row) => row.id === 's2')?.cells.kind).toBe('ending');
    expect(rows.find((row) => row.id === 's9')?.cells.detail).toContain('orphan');
    expect(links).toContainEqual({ source: 's1', target: 's2', label: '去A' });
  });
});
