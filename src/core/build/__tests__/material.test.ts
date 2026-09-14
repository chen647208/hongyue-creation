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
import { applyMaterialPolicy, COMPENDIUM_BUILD_PROFILE, DEFAULT_BUILD_PROFILE, type MaterialPolicy, runBuild, select } from '../index.js';

function node(id: string, type: string, title: string, body = ''): NodeEntity {
  return { id, bookId: 'b1', type, title, body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function attr(nodeId: string, name: string, value: string): AttributeEntity {
  return { id: `a:${nodeId}:${name}`, nodeId, type: 'label', name, value, inheritable: false, position: 0, erased: false } as AttributeEntity;
}

function entities(): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  return {
    nodes: [
      node('ch1', 'novel.chapter', '第一章', '正文一'),
      node('ch2', 'novel.chapter', '第二章', '正文二'),
      node('ch-mat', 'novel.chapter', '素材章', '素材正文'),
      node('cardA', 'card.character', '主角', '主角设定'),
    ],
    attrs: [attr('ch-mat', 'material', 'true')],
    edges: [],
  };
}

describe('applyMaterialPolicy（纯函数）', () => {
  const nodes = [
    { id: 'a', type: 'novel.chapter', title: 'A', body: '', order: 0, material: false },
    { id: 'b', type: 'novel.chapter', title: 'B', body: '', order: 1, material: true },
    { id: 'c', type: 'novel.chapter', title: 'C', body: '', order: 2, material: false },
  ];

  it('exclude 剔除素材，保持原序', () => {
    expect(applyMaterialPolicy(nodes, 'exclude').map((n) => n.id)).toEqual(['a', 'c']);
  });

  it('include 原样保留', () => {
    expect(applyMaterialPolicy(nodes, 'include').map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('prefer 素材前移且组内保持原序', () => {
    expect(applyMaterialPolicy(nodes, 'prefer').map((n) => n.id)).toEqual(['b', 'a', 'c']);
  });

  it('默认策略为 exclude', () => {
    expect(applyMaterialPolicy(nodes).map((n) => n.id)).toEqual(['a', 'c']);
  });
});

describe('成稿编译排除素材', () => {
  it('默认 profile（缺 materialPolicy）不产出素材章节', () => {
    const { text } = runBuild(DEFAULT_BUILD_PROFILE, entities());
    expect(text).toContain('正文一');
    expect(text).not.toContain('素材正文');
  });

  it('select 显式 exclude 与缺省一致', () => {
    const selected = select(DEFAULT_BUILD_PROFILE, entities());
    expect(selected.some((n) => n.id === 'ch-mat')).toBe(false);
  });

  it('materialPolicy=include 保留素材章节', () => {
    const profile = { ...DEFAULT_BUILD_PROFILE, selection: { ...DEFAULT_BUILD_PROFILE.selection, materialPolicy: 'include' as MaterialPolicy } };
    const selected = select(profile, entities());
    expect(selected.some((n) => n.id === 'ch-mat')).toBe(true);
  });
});

describe('设定集编译优先取素材', () => {
  it('素材章节无视 includeTypes 与 hide 进入设定集并排在非素材之前', () => {
    const { nodes, text } = runBuild(COMPENDIUM_BUILD_PROFILE, entities());
    // 素材章非 card/meta 类型，仍被纳入
    expect(nodes.some((n) => n.id === 'ch-mat')).toBe(true);
    // 排在最前（prefer）
    expect(nodes[0]?.id).toBe('ch-mat');
    // 非素材章节仍不入选（includeTypes 未含 novel.chapter）
    expect(nodes.some((n) => n.id === 'ch1')).toBe(false);
    // 设定卡片入选
    expect(nodes.some((n) => n.id === 'cardA')).toBe(true);
    // 素材正文实际渲染进设定集（未被 headings.hide 丢弃）
    expect(text).toContain('素材正文');
    expect(text).not.toContain('正文一');
  });
});
