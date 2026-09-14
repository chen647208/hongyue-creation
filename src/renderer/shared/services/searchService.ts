/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 跨书混合检索（docs/design/24 D2）：FTS5 命中 + 向量命中，按 RRF 融合后统一排序。
 * 向量侧需配置嵌入且已建索引；任一环节不可用即退化为纯 FTS，不阻断检索。
 */
import { MIN_SEARCH_QUERY_LENGTH } from '../../../shared/constants/search';
import type { SearchResult } from '../../../shared/types';
import { logger } from '../utils/logger';
import { vectorIntegrationService } from './knowledge/vectorIntegrationService';
import { repository } from './repository';
import type { SearchHit } from './repository/types';
import { reciprocalRankFusion } from './searchFusion';

function vectorHitToSearchHit(result: SearchResult, rank: number): SearchHit {
  const doc = result.document;
  return {
    scope: 'knowledge',
    projectId: doc.projectId,
    id: doc.knowledgeItemId || doc.id,
    title: result.metadata.name ?? '',
    snippet: result.content.slice(0, 160),
    rank,
  };
}

/**
 * 混合检索：FTS 命中 +（可选）活跃书向量命中，RRF 融合。
 * projectId 为当前活动书；缺省或向量不可用时只走 FTS。
 */
export async function hybridSearch(
  query: string,
  options?: { projectId?: string; limit?: number; preferMaterial?: boolean },
): Promise<SearchHit[]> {
  const limit = options?.limit ?? 50;
  const q = query.trim();
  if (q.length < MIN_SEARCH_QUERY_LENGTH) return [];

  const fts = await repository.search(q, { limit: limit * 2, preferMaterial: options?.preferMaterial }).catch(() => [] as SearchHit[]);
  if (!options?.projectId) return fts.slice(0, limit);

  let vector: SearchHit[] = [];
  try {
    const results = await vectorIntegrationService.semanticSearchKnowledge(options.projectId, q, { limit });
    vector = results.map((r, i) => vectorHitToSearchHit(r, i));
  } catch (error) {
    logger.warn('向量检索不可用，混合检索退化为 FTS：', error);
    vector = [];
  }
  if (vector.length === 0) return fts.slice(0, limit);

  return reciprocalRankFusion([fts, vector], (h) => `${h.scope}:${h.projectId}:${h.id}`).slice(0, limit);
}
