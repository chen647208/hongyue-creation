/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { AttributeEntity, NodeEntity } from '../../entities';
import {
  buildCitationUsage,
  CITATION_STYLES,
  collectReferenceSources,
  createInlineReferences,
  formatBibliography,
  getCitationStyle,
  referenceEntities,
  type ReferenceInput,
  resolveInlineReferences,
} from '../references';

function refNode(id: string, title: string): NodeEntity {
  return { id, bookId: 'b1', type: 'meta.reference', title, body: '', createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function attr(nodeId: string, name: string, value: string): AttributeEntity {
  return { id: `a:${nodeId}:${name}`, nodeId, type: 'label', name, value, inheritable: false, position: 0, erased: false } as AttributeEntity;
}

function chapter(id: string, body: string, title = '章'): NodeEntity {
  return { id, bookId: 'b1', type: 'novel.chapter', title, body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

const sources = collectReferenceSources(
  [refNode('r1', '第一本书'), refNode('r2', '第二篇论文'), refNode('r3', '一个网页')],
  [
    attr('r1', 'citekey', 'book1'), attr('r1', 'type', 'book'), attr('r1', 'authors', '张三'), attr('r1', 'year', '2001'), attr('r1', 'publisher', '甲出版社'), attr('r1', 'place', '北京'),
    attr('r2', 'citekey', 'paper2'), attr('r2', 'type', 'article'), attr('r2', 'authors', '李四'), attr('r2', 'year', '2010'), attr('r2', 'container', '某学报'), attr('r2', 'volume', '3'), attr('r2', 'issue', '2'), attr('r2', 'pages', '10-20'),
    attr('r3', 'citekey', 'web3'), attr('r3', 'type', 'web'), attr('r3', 'authors', '王五'), attr('r3', 'year', '2020'), attr('r3', 'url', 'https://example.com'), attr('r3', 'accessed', '2026-01-01'),
  ],
);

describe('collectReferenceSources', () => {
  it('按 citekey 收集结构化字段，缺省回落节点 id', () => {
    expect([...sources.keys()].sort()).toEqual(['book1', 'paper2', 'web3']);
    expect(sources.get('paper2')).toMatchObject({ type: 'article', container: '某学报', pages: '10-20' });
  });

  it('重复 citekey 保留字段更完整的一条', () => {
    const merged = collectReferenceSources(
      [refNode('x', '简'), refNode('y', '详')],
      [attr('x', 'citekey', 'k'), attr('y', 'citekey', 'k'), attr('y', 'authors', '作者'), attr('y', 'year', '1999')],
    );
    expect(merged.get('k')?.title).toBe('详');
    expect(merged.get('k')?.authors).toBe('作者');
  });

  it('referenceEntities 往返：投影后仍可收集到同字段', () => {
    const inputs: ReferenceInput[] = [{ id: 'rid', citekey: 'k1', title: '题', type: 'book', authors: '作者', year: '2000' }];
    const { nodes, attrs } = referenceEntities(inputs, 'b1');
    const restored = collectReferenceSources(nodes, attrs);
    expect(restored.get('k1')).toMatchObject({ title: '题', authors: '作者', year: '2000' });
  });
});

describe('引用编号与重排', () => {
  it('重复引用复用同一编号，按首次出现分配', () => {
    const state = createInlineReferences(sources, 'numbered', 'txt');
    const out = resolveInlineReferences('甲[@book1] 乙[@paper2] 丙[@book1]', state);
    expect(out).toBe('甲[1] 乙[2] 丙[1]');
    expect(state.order).toEqual(['book1', 'paper2']);
  });

  it('删除一处引用后编号自动重排', () => {
    const before = createInlineReferences(sources, 'numbered', 'txt');
    resolveInlineReferences('[@book1] [@paper2] [@web3]', before);
    expect(before.numbers.get('web3')).toBe(3);

    const after = createInlineReferences(sources, 'numbered', 'txt');
    resolveInlineReferences('[@book1] [@web3]', after);
    expect(after.numbers.get('web3')).toBe(2);
  });

  it('定位随标记附带，多条用分号连接', () => {
    const state = createInlineReferences(sources, 'numbered', 'txt');
    const out = resolveInlineReferences('见 [@book1|p. 3] 与 [@book1; @paper2]', state);
    expect(out).toBe('见 [1], p. 3 与 [1]; [2]');
  });

  it('来源缺失写失链标记且不进文献表', () => {
    const state = createInlineReferences(sources, 'numbered', 'html');
    const out = resolveInlineReferences('[@nope] 与 [@book1]', state);
    expect(out).toContain('【失链：nope】');
    expect(state.broken).toEqual(['nope']);
    expect(state.order).toEqual(['book1']);
  });

  it('脚注抽取为文末注并按序编号', () => {
    const state = createInlineReferences(sources, 'numbered', 'md');
    const out = resolveInlineReferences('正文^[一]与^[二]', state);
    expect(out).toBe('正文[^1]与[^2]');
    expect(state.footnotes).toEqual(['一', '二']);
  });
});

describe('参考文献表生成', () => {
  it('编号样式按引用顺序输出，含类型标识', () => {
    const entries = formatBibliography(['paper2', 'book1'], sources, 'numbered');
    expect(entries[0]).toMatch(/^\[1\] 李四/);
    expect(entries[0]).toContain('[J]');
    expect(entries[0]).toContain('某学报');
    expect(entries[1]).toMatch(/^\[2\] 张三/);
    expect(entries[1]).toContain('[M]');
  });

  it('作者-年份样式按作者/年份排序且内联为作者年份', () => {
    const entries = formatBibliography(['book1', 'paper2'], sources, 'author-date');
    expect(entries[0]?.startsWith('李四')).toBe(true);
    expect(entries[1]?.startsWith('张三')).toBe(true);
    const style = getCitationStyle('author-date');
    expect(style.inline(sources.get('book1')!, 1)).toBe('(张三, 2001)');
  });

  it('样式清单可枚举，未知样式回落编号样式', () => {
    expect(CITATION_STYLES.map((style) => style.id)).toEqual(['numbered', 'author-date']);
    expect(getCitationStyle('missing').id).toBe('numbered');
  });
});

describe('双向关联与失链报告', () => {
  it('产出来源→章节反查与失链清单', () => {
    const usage = buildCitationUsage(
      [chapter('c1', '甲[@book1]\n乙[@paper2]'), chapter('c2', '丙[@book1] 丁[@ghost]')],
      sources,
    );
    expect(usage.byKey.get('book1')).toEqual(['c1', 'c2']);
    expect(usage.broken.map((hit) => hit.citekey)).toEqual(['ghost']);
    expect(usage.broken[0]).toMatchObject({ nodeId: 'c2', line: 1 });
    expect(usage.occurrences).toHaveLength(4);
  });
});
