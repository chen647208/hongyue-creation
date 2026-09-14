/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { Project } from '@shared/types';
import { describe, expect,it } from 'vitest';

import type { ExportCompileOptions } from '../types';
import { applyExportCompileOptions, buildExportContent, listBuildContentTypes, projectToBuildEntities } from '../utils';

function bookWithGroup(): Project {
  return {
    id: 'b1',
    title: '书',
    inspiration: '',
    intro: '',
    outline: '',
    characters: [],
    knowledge: [],
    virtualChapters: [],
    lastModified: 0,
    chapters: [{ id: 'c1', title: '第一章', summary: '', content: '正文。', order: 0, groupId: 'g1' }],
    groups: [{ id: 'g1', label: '上卷', order: 0 }],
  };
}

function compileOptions(overrides: Partial<ExportCompileOptions> = {}): ExportCompileOptions {
  return {
    materialPolicy: 'exclude',
    tocEnabled: false,
    tocDepth: 1,
    headingLevel: 2,
    rangeFrom: null,
    rangeTo: null,
    volumeIds: [],
    volumeTypes: [],
    frontMatterIds: [],
    backMatterIds: [],
    ...overrides,
  };
}

describe('类型级分卷（volumeTypes）', () => {
  it('分组投影为 novel.part 节点，排序落于成员章节之前', () => {
    const { nodes, attrs } = projectToBuildEntities(bookWithGroup());
    const part = nodes.find((node) => node.type === 'novel.part');
    expect(part).toMatchObject({ id: 'g1', title: '上卷' });
    const order = attrs.find((attr) => attr.nodeId === 'g1' && attr.name === 'order');
    expect(Number(order?.value)).toBeLessThan(0);
  });

  it('类型候选列出作品实际存在的正文类型', () => {
    const types = listBuildContentTypes(bookWithGroup()).map((option) => option.type);
    expect(types).toContain('novel.part');
    expect(types).toContain('novel.chapter');
  });

  it('编译覆盖项写入 volumeTypes 并把该类型并入 includeTypes', () => {
    const withType = applyExportCompileOptions(
      { name: 'x', format: 'md', selection: { includeTypes: ['novel.chapter'], includeInactive: false, exclude: [], rootSwitches: { cards: false, meta: false } }, transform: { headings: { chapter: '%N、%T', scene: '', hide: [], renumber: true }, content: { includeSynopsis: false, includeComments: false, stripTags: [], resolveRefs: 'raw' } }, render: { chapterPageBreak: false, stripUnicode: false } },
      compileOptions({ volumeTypes: ['novel.part'] }),
    );
    expect(withType.compile?.volumeTypes).toEqual(['novel.part']);
    expect(withType.selection.includeTypes).toContain('novel.part');
  });

  it('未选分卷类型时分卷不进入产物；选中后产出分卷标题', () => {
    const plain = buildExportContent(bookWithGroup(), new Set(['c1']), 'md', undefined, compileOptions());
    expect(plain).not.toContain('上卷');
    const withVolume = buildExportContent(bookWithGroup(), new Set(['c1']), 'md', undefined, compileOptions({ volumeTypes: ['novel.part'] }));
    expect(withVolume).toContain('第1卷 上卷');
    expect(withVolume).toContain('正文。');
  });
});
