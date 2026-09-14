/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import { rankSearchHits } from '../searchRank';
import type { SearchHit } from '../types';

function hit(id: string, rank: number, material?: boolean): SearchHit {
  return { scope: 'chapter', projectId: 'b1', id, rank, snippet: '', material };
}

describe('rankSearchHits（设定集检索素材优先）', () => {
  const hits = [hit('a', 1), hit('b', 2, true), hit('c', 3, true), hit('d', 4)];

  it('preferMaterial=false 保持原序', () => {
    expect(rankSearchHits(hits, false).map((h) => h.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('preferMaterial=true 素材整体前移且组内保持相关度序', () => {
    expect(rankSearchHits(hits, true).map((h) => h.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('无素材命中时不变', () => {
    const plain = [hit('a', 1), hit('d', 4)];
    expect(rankSearchHits(plain, true).map((h) => h.id)).toEqual(['a', 'd']);
  });

  it('不改入参顺序', () => {
    rankSearchHits(hits, true);
    expect(hits.map((h) => h.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
