/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
import { describe, expect,it } from 'vitest';

import type { Project } from '../../../../../shared/types';
import { buildExportPackage } from '../exportBuild';

const project = (chapters: Project['chapters']): Project =>
  ({
    id: 'b1',
    title: '雾港来信',
    inspiration: '',
    intro: '潮水漫过石阶。',
    characters: [],
    outline: '',
    chapters,
    virtualChapters: [],
    knowledge: [],
    lastModified: 1,
  }) as unknown as Project;

const chapter = (id: string, order: number, content: string): Project['chapters'][number] =>
  ({ id, title: `第${id}章`, summary: '', content, order }) as Project['chapters'][number];

describe('buildExportPackage', () => {
  it('epub 书名只出现一次（管线头与打包器不重复）', () => {
    const files = buildExportPackage(
      project([chapter('c1', 0, '林渊推门。')]),
      new Set(['c1']),
      'epub',
    );
    const xhtml = files['OEBPS/content.xhtml'] ?? '';
    expect(xhtml.match(/雾港来信/g)?.length).toBe(2); // title 标签 + h1，各一次
    expect(xhtml).toContain('林渊推门');
  });

  it('docx 段落映射且 électronique 无残留 html 标签', () => {
    const files = buildExportPackage(
      project([chapter('c1', 0, '第一段。\n\n第二段。')]),
      new Set(['c1']),
      'docx',
    );
    const doc = files['word/document.xml'] ?? '';
    expect(doc).toContain('雾港来信');
    expect(doc).not.toContain('<p>');
    expect(doc).not.toContain('<h1>');
  });

  it('未选中章节被排除', () => {
    const files = buildExportPackage(
      project([chapter('c1', 0, '保留'), chapter('c2', 1, '丢弃')]),
      new Set(['c1']),
      'epub',
    );
    const xhtml = files['OEBPS/content.xhtml'] ?? '';
    expect(xhtml).toContain('保留');
    expect(xhtml).not.toContain('丢弃');
  });
});
