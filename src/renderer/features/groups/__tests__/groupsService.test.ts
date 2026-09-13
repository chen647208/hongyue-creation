/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Chapter } from '@shared/types';
import { describe, expect, it } from 'vitest';

import { addGroup, assignChapters, removeGroup, renameGroup, splitByGroup } from '../groupsService';

function chapter(id: string, groupId?: string): Chapter {
  return { id, title: id, summary: '', content: '', order: 0, groupId };
}

describe('groupsService', () => {
  it('新增/改名/删除分组', () => {
    let groups = addGroup([], '第一卷', 'g1');
    groups = addGroup(groups, '第二卷', 'g2');
    expect(groups.map((group) => group.order)).toEqual([0, 1]);
    groups = renameGroup(groups, 'g1', '上卷');
    expect(groups[0]?.label).toBe('上卷');
    expect(removeGroup(groups, 'g1').map((group) => group.id)).toEqual(['g2']);
  });

  it('把章节归入分组，传 undefined 取消归属', () => {
    const chapters = [chapter('c1', 'g1'), chapter('c2')];
    const assigned = assignChapters(chapters, 'g2', ['c2']);
    expect(assigned.find((item) => item.id === 'c2')?.groupId).toBe('g2');
    const cleared = assignChapters(chapters, undefined, ['c1']);
    expect(cleared.find((item) => item.id === 'c1')?.groupId).toBeUndefined();
  });

  it('按分组拆分，未知归属并入未分组', () => {
    const groups = addGroup([], '卷一', 'g1');
    const sections = splitByGroup(groups, [chapter('c1', 'g1'), chapter('c2', 'gone'), chapter('c3')]);
    expect(sections[0]?.chapters.map((item) => item.id)).toEqual(['c1']);
    expect(sections[1]?.group).toBeNull();
    expect(sections[1]?.chapters.map((item) => item.id)).toEqual(['c2', 'c3']);
  });
});
