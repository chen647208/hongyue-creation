// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** JSON 后端契约：项目增删查往返（与 SQLite 后端共享同一 StorageRepository 语义）。 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { Project } from '../../../../../shared/types';
import { jsonRepository } from '../jsonRepository';

function book(id: string, title: string): Project {
  return {
    id,
    title,
    inspiration: '',
    intro: '',
    outline: '',
    chapters: [{ id: `${id}-c1`, title: '第一章', summary: '', content: '正文', order: 0 }],
    virtualChapters: [],
    knowledge: [],
    characters: [],
    lastModified: 0,
  };
}

describe('jsonRepository 契约', () => {
  beforeEach(async () => {
    await jsonRepository.clear();
  });

  it('保存项目后可按全量读回', async () => {
    await jsonRepository.saveProject(book('p1', '甲书'));
    const state = await jsonRepository.loadAll();
    expect(state?.projects.map((project) => project.id)).toEqual(['p1']);
    expect(state?.projects[0]?.chapters[0]?.content).toBe('正文');
  });

  it('重复保存同 id 为更新而非追加', async () => {
    await jsonRepository.saveProject(book('p1', '甲书'));
    await jsonRepository.saveProject(book('p1', '甲书改'));
    const state = await jsonRepository.loadAll();
    expect(state?.projects).toHaveLength(1);
    expect(state?.projects[0]?.title).toBe('甲书改');
  });

  it('删除项目后读回为空', async () => {
    await jsonRepository.saveProject(book('p1', '甲书'));
    await jsonRepository.deleteProject('p1');
    const state = await jsonRepository.loadAll();
    expect(state?.projects ?? []).toEqual([]);
  });
});
