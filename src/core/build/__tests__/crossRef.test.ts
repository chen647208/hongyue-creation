/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { AttributeEntity, EdgeEntity,NodeEntity } from '../../entities';
import { type BuildProfile, DEFAULT_BUILD_PROFILE, normalizeProfile, runBuild } from '../index.js';

function node(id: string, type: string, title: string, body = ''): NodeEntity {
  return { id, bookId: 'b1', type, title, body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function attr(nodeId: string, name: string, value: string): AttributeEntity {
  return { id: `a:${nodeId}:${name}`, nodeId, type: 'label', name, value, inheritable: false, position: 0, erased: false } as AttributeEntity;
}

function profile(overrides: Partial<BuildProfile> = {}): BuildProfile {
  return normalizeProfile({ ...DEFAULT_BUILD_PROFILE, format: 'md', ...overrides });
}

function world(): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  return {
    nodes: [
      node('c1', 'novel.chapter', '第一章', '参见 ((#c2)) 与 ((#fig1))。\n# @figure: fig1 | 结构图\n引用 ((#missing))。'),
      node('c2', 'novel.chapter', '第二章', '正文。'),
    ],
    attrs: [attr('c1', 'order', '0'), attr('c2', 'order', '1')],
    edges: [],
  };
}

describe('交叉引用编号重算', () => {
  it('章节与图表编号在渲染前算清，正文引用替换为编号', () => {
    const { text } = runBuild(profile(), world());
    expect(text).toContain('参见 2 与 图 1。');
    expect(text).toContain('图 1：结构图');
  });

  it('失链目标写标记，不影响其他引用', () => {
    const { text } = runBuild(profile(), world());
    expect(text).toContain('【失链引用：missing】');
    expect(text).toContain('2');
  });

  it('章节增删后编号自动重排', () => {
    const entities = world();
    entities.nodes.unshift(node('c0', 'novel.chapter', '序章', '引子。'));
    entities.attrs.unshift(attr('c0', 'order', '-1'));
    const { text } = runBuild(profile(), entities);
    expect(text).toContain('参见 3 与 图 1。');
  });

  it('图表跨章按正文出现顺序连续编号', () => {
    const entities = world();
    entities.nodes.push(node('c3', 'novel.chapter', '第三章', '# @figure: fig2 | 流程图\n正文。'));
    entities.attrs.push(attr('c3', 'order', '2'));
    const { text } = runBuild(profile(), entities);
    expect(text).toContain('图 1：结构图');
    expect(text).toContain('图 2：流程图');
  });
});
