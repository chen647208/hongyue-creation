/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 知识库检索（从 StepKnowledgeEnhanced 抽出，便于单测与复用）：
 * semantic（向量）/ hybrid（向量+关键词）/ keyword（FTS5 trigram，短查询回退子串）三种模式。
 */
import { DEFAULT_KEYWORD_WEIGHT,DEFAULT_SEMANTIC_WEIGHT } from '../../../../shared/constants/chapters';
import { type HybridSearchResult, type KnowledgeItem } from '../../../../shared/types';
import { vectorIntegrationService } from './vectorIntegrationService';

export type KnowledgeSearchMode = 'semantic' | 'hybrid' | 'keyword';

/** FTS 关键词检索接口（由调用方注入 repository，避免 feature 直连内部实现）。
 *  preferMaterial：设定集检索时素材命中优先返回。 */
export type KeywordSearchFn = (query: string, options: { projectId: string; limit: number; preferMaterial?: boolean }) => Promise<Array<{ scope: string; id: string }>>;

export const SEARCH_LIMIT = 10;
export const SEARCH_THRESHOLD = 0.3;

export interface SearchKnowledgeParams {
  projectId: string;
  query: string;
  mode: KnowledgeSearchMode;
  /** 当前分类过滤后的条目（keyword 模式取交集用）。 */
  categoryItems: KnowledgeItem[];
  /** 长关键词走 FTS 时注入的检索函数。 */
  search: KeywordSearchFn;
}

export async function searchKnowledge({ projectId, query, mode, categoryItems, search }: SearchKnowledgeParams): Promise<HybridSearchResult[]> {
  switch (mode) {
    case 'semantic': {
      const semanticResults = await vectorIntegrationService.semanticSearchKnowledge(projectId, query, {
        limit: SEARCH_LIMIT,
        threshold: SEARCH_THRESHOLD,
      });
      return semanticResults.map((result) => ({
        ...result,
        semanticScore: result.score,
        keywordScore: 0,
        combinedScore: result.score,
      }));
    }
    case 'hybrid':
      return vectorIntegrationService.hybridSearchKnowledge(projectId, query, {
        limit: SEARCH_LIMIT,
        threshold: SEARCH_THRESHOLD,
        semanticWeight: DEFAULT_SEMANTIC_WEIGHT,
        keywordWeight: DEFAULT_KEYWORD_WEIGHT,
      });
    case 'keyword': {
      // 关键词检索优先走 FTS5(trigram) 索引；短查询(<3 字符) trigram 无法命中，回退内存子串匹配。
      let matchedItems: KnowledgeItem[];
      if (query.trim().length >= 3) {
        const hits = await search(query, { projectId, limit: 50, preferMaterial: true });
        const byId = new Map(categoryItems.map((i) => [i.id, i]));
        matchedItems = hits
          .filter((h) => h.scope === 'knowledge')
          .map((h) => byId.get(h.id))
          .filter((x): x is KnowledgeItem => Boolean(x));
      } else {
        const lower = query.toLowerCase();
        matchedItems = categoryItems.filter((item) =>
          item.name.toLowerCase().includes(lower) || item.content.toLowerCase().includes(lower));
      }
      return matchedItems.map((item) => {
        const metadata = {
          category: item.category,
          type: item.type,
          size: item.size,
          addedAt: item.addedAt,
          name: item.name,
        };
        return {
          document: {
            id: item.id,
            projectId,
            knowledgeItemId: item.id,
            content: item.content.substring(0, 200),
            embedding: [],
            metadata,
          },
          score: 1.0,
          content: item.content.substring(0, 200),
          metadata,
          semanticScore: 0,
          keywordScore: 1.0,
          combinedScore: 1.0,
        };
      });
    }
  }
}
