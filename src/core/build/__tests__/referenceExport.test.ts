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
import { buildOdtFiles } from '../odt.js';
import { buildDocxFiles } from '../package.js';

function node(id: string, type: string, title: string, body = ''): NodeEntity {
  return { id, bookId: 'b1', type, title, body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function attr(nodeId: string, name: string, value: string): AttributeEntity {
  return { id: `a:${nodeId}:${name}`, nodeId, type: 'label', name, value, inheritable: false, position: 0, erased: false } as AttributeEntity;
}

function world(): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  return {
    nodes: [
      node('ch1', 'novel.chapter', '第一章', '正文提到 [@book1|p. 3] 与 [@paper2]。^[第一条脚注]\n^anchorA\n第二段引用 [@book1]。'),
      node('r1', 'meta.reference', '第一本书'),
      node('r2', 'meta.reference', '第二篇论文'),
    ],
    attrs: [
      attr('ch1', 'order', '1'),
      attr('r1', 'citekey', 'book1'), attr('r1', 'type', 'book'), attr('r1', 'authors', '张三'), attr('r1', 'year', '2001'), attr('r1', 'publisher', '甲出版社'), attr('r1', 'place', '北京'),
      attr('r2', 'citekey', 'paper2'), attr('r2', 'type', 'article'), attr('r2', 'authors', '李四'), attr('r2', 'year', '2010'), attr('r2', 'container', '某学报'),
    ],
    edges: [],
  };
}

function profile(overrides: Partial<BuildProfile> = {}): BuildProfile {
  return normalizeProfile({ ...DEFAULT_BUILD_PROFILE, ...overrides });
}

describe('导出集成：脚注与参考文献表', () => {
  it('md 产物含文中编号、脚注定义与参考文献表', () => {
    const { text, blocks } = runBuild(profile({ format: 'md' }), world());
    expect(text).toContain('正文提到 [1], p. 3 与 [2]。');
    expect(text).toContain('第二段引用 [1]。');
    expect(text).toContain('[^1]: 第一条脚注');
    expect(text).toMatch(/## 参考文献/);
    expect(text).toContain('[1] 张三');
    expect(text).toContain('[2] 李四');
    expect(blocks.some((block) => block.kind === 'bibliography')).toBe(true);
    expect(blocks.some((block) => block.kind === 'footnotes')).toBe(true);
  });

  it('html 产物含脚注与参考文献 section', () => {
    const { text } = runBuild(profile({ format: 'html' }), world());
    expect(text).toContain('<section class="footnotes">');
    expect(text).toContain('<section class="bibliography">');
    expect(text).toContain('第一条脚注');
  });

  it('ODT 产物含脚注与参考文献文本', () => {
    const { text } = runBuild(profile({ format: 'html' }), world());
    const files = buildOdtFiles({ title: '书', htmlBody: text });
    const content = files['content.xml'] ?? '';
    expect(content).toContain('参考文献');
    expect(content).toContain('张三');
    expect(content).toContain('第一条脚注');
  });

  it('DOCX 产物含脚注与参考文献段落', () => {
    const { text } = runBuild(profile({ format: 'html' }), world());
    const files = buildDocxFiles({ title: '书', htmlBody: text });
    const document = files['word/document.xml'] ?? '';
    expect(document).toContain('参考文献');
    expect(document).toContain('张三');
    expect(document).toContain('第一条脚注');
  });

  it('关闭参考文献表时仍编号但不产出文末表', () => {
    const { text, blocks } = runBuild(profile({ format: 'md', references: { enabled: false } }), world());
    expect(text).toContain('[1]');
    expect(blocks.some((block) => block.kind === 'bibliography')).toBe(false);
  });

  it('作者-年份样式内联为作者年份', () => {
    const { text } = runBuild(profile({ format: 'md', references: { enabled: true, style: 'author-date' } }), world());
    expect(text).toContain('(张三, 2001)');
  });

  it('失链引用写标记且不生成对应文末条目', () => {
    const entities = world();
    entities.nodes[0]!.body = '引用 [@missing] 与 [@book1]。';
    const { text } = runBuild(profile({ format: 'md' }), entities);
    expect(text).toContain('【失链：missing】');
    expect(text).toContain('[1] 张三');
    expect(text).not.toContain('[2] 李四');
  });

  it('硬验收：块锚与块引用语法不入正文，引文照常编号', () => {
    const entities = world();
    entities.nodes[0]!.body = '^anchorA\n可见段 [@book1]。\n\n引用 ((^anchorA))。';
    const { text } = runBuild(profile({ format: 'md' }), entities);
    expect(text).not.toContain('^anchorA');
    expect(text).not.toContain('((^');
    expect(text).toContain('可见段 [1]。');
  });
});
