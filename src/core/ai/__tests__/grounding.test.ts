/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import {
  buildCitations,
  describeRetrieval,
  formatNoRetrieval,
  quoteAppearsExactly,
  renderCitations,
  toCitation,
} from '../grounding.js';

describe('toCitation / buildCitations（出处规范化）', () => {
  it('FTS 命中规范化为引用并带 anchor', () => {
    const citation = toCitation({ scope: 'chapter', id: 'ch1', title: '雨夜', snippet: '片段', rank: 2, material: true });
    expect(citation).toMatchObject({
      id: 'chapter:ch1',
      sourceKind: 'chapter',
      refId: 'ch1',
      anchor: 'chapter:ch1',
      rank: 2,
      material: true,
    });
  });

  it('语义命中（name/content/score）归一化为知识库引用', () => {
    const citation = toCitation({ name: '星辉术', content: '星辰之力', score: 0.9 });
    expect(citation?.sourceKind).toBe('knowledge');
    expect(citation?.anchor).toBe('knowledge:星辉术');
  });

  it('缺 id/名称或无片段时返回 null', () => {
    expect(toCitation({ snippet: '只有片段' })).toBeNull();
    expect(toCitation({ id: 'x', snippet: '   ' })).toBeNull();
  });

  it('按相关度排序并按 id 去重', () => {
    const citations = buildCitations([
      { id: 'a', scope: 'knowledge', snippet: 'A', rank: 5 },
      { id: 'b', scope: 'chapter', snippet: 'B', rank: 1 },
      { id: 'a', scope: 'knowledge', snippet: 'A2', rank: 0 },
    ]);
    expect(citations.map((c) => c.id)).toEqual(['chapter:b', 'knowledge:a']);
  });
});

describe('describeRetrieval（可信检索措辞）', () => {
  it('命中返回带出处的清单文本', () => {
    const outcome = describeRetrieval('星辉', [{ scope: 'knowledge', id: 'k1', title: '星辉术', snippet: '以星辰之力驱动', rank: 0 }]);
    expect(outcome.found).toBe(true);
    expect(outcome.citations).toHaveLength(1);
    expect(outcome.text).toContain('知识库《星辉术》');
    expect(outcome.text).toContain('出处 knowledge:k1');
  });

  it('空结果明确说未找到并禁止编造', () => {
    const outcome = describeRetrieval('不存在的词', []);
    expect(outcome.found).toBe(false);
    expect(outcome.citations).toEqual([]);
    expect(outcome.text).toContain('未找到');
    expect(outcome.text).toContain('不要据此编造');
  });

  it('空查询退化为范围说明', () => {
    expect(formatNoRetrieval('   ')).toContain('未检索到资料');
  });

  it('renderCitations 逐条编号并标注出处', () => {
    const citations = buildCitations([{ scope: 'chapter', id: 'ch1', title: '雨夜', snippet: '片段', rank: 0 }]);
    const text = renderCitations('雨夜', citations);
    expect(text).toContain('[1] 章节《雨夜》');
    expect(text).toContain('出处 chapter:ch1');
  });
});

describe('quoteAppearsExactly（逐字校验）', () => {
  it('原文连续子串通过，改写或空引用不通过', () => {
    expect(quoteAppearsExactly('星辰之力', '以星辰之力驱动')).toBe(true);
    expect(quoteAppearsExactly('星辰的力量', '以星辰之力驱动')).toBe(false);
    expect(quoteAppearsExactly('', '原文')).toBe(false);
  });
});
