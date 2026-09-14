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
import {
  applyRange,
  type BuildProfile,
  clampHeadingLevel,
  COMPILE_DEFAULTS,
  DEFAULT_BUILD_PROFILE,
  MANUSCRIPT_BUILD_PROFILE,
  normalizeProfile,
  parseProfileYaml,
  runBuild,
  select,
  serializeProfileYaml,
  validateProfile,
} from '../index.js';

function node(id: string, type: string, title: string, body = ''): NodeEntity {
  return { id, bookId: 'b1', type, title, body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function attr(nodeId: string, name: string, value: string): AttributeEntity {
  return { id: `a:${nodeId}:${name}`, nodeId, type: 'label', name, value, inheritable: false, position: 0, erased: false } as AttributeEntity;
}

function world(): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  return {
    nodes: [
      node('front', 'novel.chapter', '前言', '写在开篇。'),
      node('part1', 'novel.part', '第一卷', ''),
      node('ch1', 'novel.chapter', '初遇', '正文一。'),
      node('ch2', 'novel.chapter', '同行', '正文二。'),
      node('back', 'novel.chapter', '后记', '写在末尾。'),
    ],
    attrs: [
      attr('front', 'order', '0'),
      attr('part1', 'order', '1'),
      attr('ch1', 'order', '2'),
      attr('ch2', 'order', '3'),
      attr('back', 'order', '4'),
    ],
    edges: [],
  };
}

function plainNodes(): Array<{ id: string; type: string; title: string; body: string; order: number; material?: boolean }> {
  return [
    { id: 'a', type: 'novel.chapter', title: 'A', body: '', order: 0, material: false },
    { id: 'b', type: 'novel.chapter', title: 'B', body: '', order: 1, material: false },
    { id: 'c', type: 'novel.chapter', title: 'C', body: '', order: 2, material: false },
    { id: 'd', type: 'novel.chapter', title: 'D', body: '', order: 3, material: false },
  ];
}

describe('编译档案装配（normalize / validate）', () => {
  it('normalize 补齐缺省：素材口径 exclude、标题层级 2、compile 空数组与目录标题', () => {
    const assembled = normalizeProfile(DEFAULT_BUILD_PROFILE);
    expect(assembled.selection.materialPolicy).toBe('exclude');
    expect(assembled.transform.headings.level).toBe(COMPILE_DEFAULTS.chapterLevel);
    expect(assembled.compile?.volumeTypes).toEqual([]);
    expect(assembled.compile?.frontMatter).toEqual([]);
    expect(assembled.compile?.backMatter).toEqual([]);
    expect(assembled.compile?.volumeHeading).toBe(COMPILE_DEFAULTS.volumeHeading);
    // 不改入参
    expect(DEFAULT_BUILD_PROFILE.transform.headings.level).toBeUndefined();
  });

  it('normalize 保留显式 compile 并补目录缺省', () => {
    const assembled = normalizeProfile({
      ...MANUSCRIPT_BUILD_PROFILE,
      compile: { toc: { enabled: true, title: '' }, frontMatter: ['front'] },
    });
    expect(assembled.compile?.toc?.title).toBe(COMPILE_DEFAULTS.tocTitle);
    expect(assembled.compile?.toc?.maxDepth).toBe(COMPILE_DEFAULTS.tocMaxDepth);
    expect(assembled.compile?.frontMatter).toEqual(['front']);
  });

  it('标题层级收进 1..6', () => {
    expect(clampHeadingLevel(undefined)).toBe(COMPILE_DEFAULTS.chapterLevel);
    expect(clampHeadingLevel(0)).toBe(1);
    expect(clampHeadingLevel(9)).toBe(6);
    expect(clampHeadingLevel(3.4)).toBe(3);
  });

  it('validate 给出可读错误（范围、层级、素材口径）', () => {
    const bad: BuildProfile = {
      ...DEFAULT_BUILD_PROFILE,
      selection: { ...DEFAULT_BUILD_PROFILE.selection, materialPolicy: 'nope' as never, range: { from: 5, to: 2 } },
      transform: { ...DEFAULT_BUILD_PROFILE.transform, headings: { ...DEFAULT_BUILD_PROFILE.transform.headings, level: 9 } },
    };
    const errors = validateProfile(bad);
    expect(errors.join('\n')).toMatch(/materialPolicy/);
    expect(errors.join('\n')).toMatch(/range.from 不能大于/);
    expect(errors.join('\n')).toMatch(/level 必须是 1\.\.6/);
  });

  it('validate 通过内置档案', () => {
    expect(validateProfile(normalizeProfile(MANUSCRIPT_BUILD_PROFILE))).toEqual([]);
  });
});

describe('范围与素材口径过滤', () => {
  it('applyRange 按 1 起含端点截取，不改入参', () => {
    const nodes = plainNodes();
    expect(applyRange(nodes, { from: 2, to: 3 }).map((n) => n.id)).toEqual(['b', 'c']);
    expect(applyRange(nodes, { to: 2 }).map((n) => n.id)).toEqual(['a', 'b']);
    expect(applyRange(nodes, { from: 3 }).map((n) => n.id)).toEqual(['c', 'd']);
    expect(applyRange(nodes, { from: 9 }).map((n) => n.id)).toEqual([]);
    expect(applyRange(nodes, undefined)).toHaveLength(4);
    expect(nodes).toHaveLength(4);
  });

  it('select 应用范围：order 排序后按序截取', () => {
    const profile: BuildProfile = {
      ...DEFAULT_BUILD_PROFILE,
      selection: { ...DEFAULT_BUILD_PROFILE.selection, range: { from: 2, to: 3 } },
    };
    const entities = {
      nodes: plainNodes().map((n) => node(n.id, n.type, n.title, n.body)),
      attrs: plainNodes().map((n) => attr(n.id, 'order', String(n.order))),
      edges: [],
    };
    expect(select(profile, entities).map((n) => n.id)).toEqual(['b', 'c']);
  });

  it('范围与素材口径叠加：prefer 前移素材后截取', () => {
    const entities = {
      nodes: plainNodes().map((n) => node(n.id, n.type, n.title, n.body)),
      attrs: [...plainNodes().map((n) => attr(n.id, 'order', String(n.order))), attr('c', 'material', 'true')],
      edges: [],
    };
    const profile: BuildProfile = {
      ...DEFAULT_BUILD_PROFILE,
      selection: { ...DEFAULT_BUILD_PROFILE.selection, materialPolicy: 'prefer', range: { from: 1, to: 3 } },
    };
    // 先按 book 序范围截取（a,b,c），prefer 再把素材 c 前移
    expect(select(profile, entities).map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('目录、分卷与前后置页变换', () => {
  const profile = normalizeProfile({
    ...MANUSCRIPT_BUILD_PROFILE,
    compile: { ...MANUSCRIPT_BUILD_PROFILE.compile, frontMatter: ['front'], backMatter: ['back'] },
  });

  it('顺序：前置页 → 目录 → 分卷/章节 → 后置页', () => {
    const { blocks } = runBuild(profile, world());
    const kinds = blocks.map((b) => b.kind);
    expect(kinds[0]).toBe('chapter');
    expect(kinds[1]).toBe('paragraph');
    expect(kinds[2]).toBe('toc');
    expect(kinds.at(-1)).toBe('paragraph');
    expect(blocks.at(-2)?.kind).toBe('chapter');
  });

  it('目录收录分卷与章节（maxDepth 2），章节重编号', () => {
    const { blocks, text } = runBuild(profile, world());
    const toc = blocks.find((b) => b.kind === 'toc');
    expect(toc).toBeDefined();
    if (toc?.kind !== 'toc') throw new Error('expected toc');
    expect(toc.title).toBe('目录');
    expect(toc.entries.map((e) => e.text)).toEqual(['第1卷 第一卷', '1、初遇', '2、同行']);
    expect(text).toContain('## 目录');
    expect(text).toContain('# 第1卷 第一卷');
    expect(text).toContain('## 1、初遇');
  });

  it('maxDepth 1 时目录不含分卷标题', () => {
    const shallow = normalizeProfile({
      ...profile,
      compile: { ...profile.compile, toc: { enabled: true, title: '目录', maxDepth: 1 } },
    });
    const { blocks } = runBuild(shallow, world());
    const toc = blocks.find((b) => b.kind === 'toc');
    if (toc?.kind !== 'toc') throw new Error('expected toc');
    expect(toc.entries.map((e) => e.text)).toEqual(['1、初遇', '2、同行']);
  });

  it('标题基础层级生效（level 3 → md ###）', () => {
    const deep = normalizeProfile({
      ...profile,
      transform: {
        ...profile.transform,
        headings: { ...profile.transform.headings, level: 3 },
      },
    });
    const { text } = runBuild(deep, world());
    expect(text).toContain('### 1、初遇');
    expect(text).toContain('## 第1卷 第一卷');
  });

  it('关闭目录时不产出 toc 块', () => {
    const off = normalizeProfile({
      ...profile,
      compile: { ...profile.compile, toc: { enabled: false, title: '目录' } },
    });
    const { blocks } = runBuild(off, world());
    expect(blocks.some((b) => b.kind === 'toc')).toBe(false);
  });
});

describe('格式序列化与产物稳定性', () => {
  const profile = normalizeProfile({
    ...MANUSCRIPT_BUILD_PROFILE,
    compile: { ...MANUSCRIPT_BUILD_PROFILE.compile, frontMatter: ['front'], backMatter: ['back'] },
  });

  it('html 目录与标题层级结构正确', () => {
    const { text } = runBuild({ ...profile, format: 'html' }, world());
    expect(text).toContain('<nav class="toc">');
    expect(text).toContain('<h1>第1卷 第一卷</h1>');
    expect(text).toContain('<h2>1、初遇</h2>');
  });

  it('txt 目录为纯文本列表', () => {
    const { text } = runBuild({ ...profile, format: 'txt' }, world());
    expect(text).toContain('目录');
    expect(text).toContain('1、初遇');
  });

  it('块锚不进入正文，块引用/嵌入按既有口径展开（含前后置页）', () => {
    const entities = {
      nodes: [
        node('front', 'novel.chapter', '前言', '^anchorA\n开篇。'),
        node('ch1', 'novel.chapter', '第一章', '^anchorB\n引见 ((^anchorA))。'),
      ],
      attrs: [attr('front', 'order', '0'), attr('ch1', 'order', '1')],
      edges: [],
    };
    const profile = normalizeProfile({
      ...MANUSCRIPT_BUILD_PROFILE,
      compile: { toc: { enabled: false, title: '目录' }, frontMatter: ['front'] },
    });
    const { text } = runBuild(profile, entities);
    expect(text).not.toContain('^anchorA');
    expect(text).not.toContain('^anchorB');
    expect(text).not.toContain('((^');
    expect(text).toContain('前言');
    expect(text).toContain('引见 开篇。');
  });

  it('compile 字段 YAML 往返无损，非法 compile 给出可读错误', () => {
    const yamlText = serializeProfileYaml(MANUSCRIPT_BUILD_PROFILE);
    const loaded = parseProfileYaml(yamlText);
    expect(loaded).toEqual(MANUSCRIPT_BUILD_PROFILE);
    expect(() =>
      parseProfileYaml(['name: x', 'format: md', 'selection: { includeTypes: [], includeInactive: false, exclude: [], rootSwitches: { cards: false, meta: false } }', 'transform: { headings: { chapter: "%T", scene: "", hide: [], renumber: false }, content: { includeSynopsis: false, includeComments: false, stripTags: [], resolveRefs: raw } }', 'render: { chapterPageBreak: false, stripUnicode: false }', 'compile: { toc: { enabled: true, title: 目录, maxDepth: 0 } }'].join('\n')),
    ).toThrow(/目录深度/);
  });
});
