/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { AttributeEntity, BookEntities, NodeEntity } from '../../entities/types';
import { buildIndex } from '../indexer';

function node(id: string, type: string, body: string): NodeEntity {
  return { id, type, title: id, bookId: 'b1', body, createdAt: 0, updatedAt: 0, erased: false };
}

function attr(nodeId: string, name: string, value: string): AttributeEntity {
  return { id: `a:${nodeId}:${name}`, nodeId, type: 'label', name, value, inheritable: false, position: 0, erased: false } as AttributeEntity;
}

function entities(): BookEntities {
  return {
    nodes: [
      node('ch1', 'novel.chapter', '# @strand: 主线\n正常正文。'),
      node('ch-mat', 'novel.chapter', '# @strand: 主线\n素材正文。'),
    ],
    edges: [],
    attrs: [attr('ch-mat', 'material', 'true')],
  };
}

describe('索引字数口径排除素材', () => {
  it('素材节点 wordCounts 归零', () => {
    const snap = buildIndex(entities());
    expect(snap.wordCounts.get('ch-mat')).toBe(0);
    expect(snap.wordCounts.get('ch1')).toBeGreaterThan(0);
  });

  it('素材节点不进叙事线统计', () => {
    const snap = buildIndex(entities());
    expect(snap.strandProgress.get('主线')?.sceneCount).toBe(1);
  });

  it('material=false 视为非素材', () => {
    const es = entities();
    es.attrs = [attr('ch-mat', 'material', 'false')];
    const snap = buildIndex(es);
    expect(snap.wordCounts.get('ch-mat')).toBeGreaterThan(0);
  });
});
