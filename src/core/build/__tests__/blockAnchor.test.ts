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
import { buildIndex } from '../../index';
import { DEFAULT_BUILD_PROFILE, runBuild } from '../index.js';

function node(id: string, body: string): NodeEntity {
  return { id, bookId: 'b1', type: 'novel.chapter', title: '第一章', body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function entities(body: string): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  return { nodes: [node('ch1', body)], attrs: [], edges: [] };
}

describe('编译/导出前剥离块锚', () => {
  it('带锚正文与无锚正文产出完全一致，且产物不含锚', () => {
    const anchored = entities('^b1\n他推开门。\n\n^b2\n第二段。');
    const plain = entities('他推开门。\n\n第二段。');
    const built = runBuild(DEFAULT_BUILD_PROFILE, anchored);
    expect(built.text).toBe(runBuild(DEFAULT_BUILD_PROFILE, plain).text);
    expect(built.text).not.toContain('^b1');
    expect(built.text).not.toContain('^b2');
    expect(built.text).toContain('他推开门。');
  });
});

describe('字数统计前剥离块锚', () => {
  it('带锚与无锚的 wordCounts 一致', () => {
    const anchored = buildIndex(entities('^b1\n他推开门。\n\n^b2\n第二段。'));
    const plain = buildIndex(entities('他推开门。\n\n第二段。'));
    expect(anchored.wordCounts.get('ch1')).toBe(plain.wordCounts.get('ch1'));
    expect(anchored.wordCounts.get('ch1')).toBeGreaterThan(0);
  });
});
