/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { SearchHit } from './types';

/**
 * 素材优先排序（设定集类检索）：preferMaterial 为真时把标记为素材的命中整体前移，
 * 组内保持调用方已排好的相关度顺序；为假时原样返回。纯函数，不改入参。
 */
export function rankSearchHits(hits: SearchHit[], preferMaterial = false): SearchHit[] {
  if (!preferMaterial || hits.length < 2) return hits;
  const material: SearchHit[] = [];
  const rest: SearchHit[] = [];
  for (const hit of hits) {
    (hit.material ? material : rest).push(hit);
  }
  return [...material, ...rest];
}
