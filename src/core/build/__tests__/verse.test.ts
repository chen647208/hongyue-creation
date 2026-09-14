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

const POEM = ['# @verse: true', '床前明月光', '疑是地上霜', '', '举头望明月', '低头思故乡'].join('\n');

function node(id: string, type: string, title: string, body = ''): NodeEntity {
  return { id, bookId: 'b1', type, title, body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function attr(nodeId: string, name: string, value: string): AttributeEntity {
  return { id: `a:${nodeId}:${name}`, nodeId, type: 'label', name, value, inheritable: false, position: 0, erased: false } as AttributeEntity;
}

function world(body = POEM): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  return {
    nodes: [node('p1', 'novel.chapter', '静夜思', body)],
    attrs: [attr('p1', 'order', '0')],
    edges: [],
  };
}

function profile(format: string): BuildProfile {
  return normalizeProfile({ ...DEFAULT_BUILD_PROFILE, format });
}

describe('诗歌分行与分节导出', () => {
  it('md 保留分行（硬换行）与分节空行，不合并为单段', () => {
    const { text } = runBuild(profile('md'), world());
    expect(text).toContain('床前明月光  \n疑是地上霜');
    expect(text).toContain('举头望明月  \n低头思故乡');
    expect(text).not.toContain('床前明月光疑是地上霜');
  });

  it('txt 逐行保留', () => {
    const { text } = runBuild(profile('txt'), world());
    expect(text).toContain('床前明月光\n疑是地上霜\n\n举头望明月\n低头思故乡');
  });

  it('html 每节成段、节内 <br> 连接', () => {
    const { text } = runBuild(profile('html'), world());
    expect(text).toContain('<p class="verse">床前明月光<br>疑是地上霜</p>');
    expect(text).toContain('<p class="verse">举头望明月<br>低头思故乡</p>');
  });

  it('ODT 分行落为 text:line-break，节间保留段落', () => {
    const { text } = runBuild(profile('html'), world());
    const files = buildOdtFiles({ title: '诗集', htmlBody: text });
    const content = files['content.xml'] ?? '';
    expect(content).toContain('床前明月光<text:line-break/>疑是地上霜');
    expect(content).toContain('举头望明月<text:line-break/>低头思故乡');
  });

  it('按类型 poem.poem 识别分行，无需关键字声明', () => {
    const entities = world();
    entities.nodes[0] = node('p1', 'poem.poem', '静夜思', '床前明月光\n疑是地上霜');
    const { text } = runBuild(normalizeProfile({ ...DEFAULT_BUILD_PROFILE, format: 'md', selection: { ...DEFAULT_BUILD_PROFILE.selection, includeTypes: ['poem.poem'] } }), entities);
    expect(text).toContain('床前明月光  \n疑是地上霜');
  });
});
