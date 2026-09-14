/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { AttributeEntity, EdgeEntity, NodeEntity } from '../../entities';
import { DEFAULT_BUILD_PROFILE, runBuild } from '../index.js';

function node(id: string, body: string, title = '章节'): NodeEntity {
  return { id, bookId: 'b1', type: 'novel.chapter', title, body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function entities(nodes: NodeEntity[]): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  return { nodes, attrs: [], edges: [] };
}

describe('编译/导出展开块引用与嵌入', () => {
  it('引用与嵌入展开为被引块文本，锚与语法零残留，跨章可解析', () => {
    const built = runBuild(DEFAULT_BUILD_PROFILE, entities([
      node('ch1', '^a1\n甲段。\n\n^a2\n引用 ((^a1))。\n\n^a3\n!((^a1))'),
      node('ch2', '^b1\n跨章 ((^a1)) 与失链 ((^zz))。'),
    ]));
    expect(built.text).toContain('甲段。');
    expect(built.text).toContain('引用 甲段。');
    expect(built.text).toContain('跨章 甲段。 与失链 【失链：zz】。');
    expect(built.text).not.toContain('((^');
    expect(built.text).not.toMatch(/^\^/m);
  });

  it('成环时截断为循环引用标记，不死循环且语法零残留', () => {
    const built = runBuild(DEFAULT_BUILD_PROFILE, entities([
      node('ch1', '^a1\n甲 !((^b1))。'),
      node('ch2', '^b1\n乙 !((^a1))。'),
    ]));
    expect(built.text).toContain('【循环引用：');
    expect(built.text).not.toContain('((^');
  });

  it('无引用正文产出与既有一致（不受影响）', () => {
    const built = runBuild(DEFAULT_BUILD_PROFILE, entities([node('ch1', '普通正文。')]));
    expect(built.text).toContain('普通正文。');
    expect(built.text).not.toContain('【');
  });
});
