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
import { type BuildProfile, DEFAULT_BUILD_PROFILE, runBuild } from '../index.js';
import { buildOdtFiles, htmlToOdtBlocks } from '../odt.js';
import { zipStore } from '../zipStore.js';

const ODT_MIME = 'application/vnd.oasis.opendocument.text';

function node(id: string, type: string, title: string, body: string): NodeEntity {
  return { id, bookId: 'b1', type, title, body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function entities(): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  return {
    nodes: [node('ch1', 'novel.chapter', '第一章', '林渊推门。')],
    attrs: [{ id: 'a1', nodeId: 'ch1', type: 'label', name: 'order', value: '0', inheritable: false, position: 0, erased: false }] as unknown as AttributeEntity[],
    edges: [],
  };
}

describe('htmlToOdtBlocks', () => {
  it('h1..h6 映射标题层级，p/li 为正文段落', () => {
    expect(htmlToOdtBlocks('<h2>第一章</h2><h3>场景</h3><p>正文</p><li>目录项</li>')).toEqual([
      { text: '第一章', level: 2 },
      { text: '场景', level: 3 },
      { text: '正文', level: 0 },
      { text: '目录项', level: 0 },
    ]);
  });

  it('去掉标签、解码实体、<br> 折为段内换行', () => {
    expect(htmlToOdtBlocks('<p>a<br>b &amp; c</p>')).toEqual([{ text: 'a\nb & c', level: 0 }]);
  });
});

describe('buildOdtFiles', () => {
  it('四条目齐全且 mimetype 首项', () => {
    const files = buildOdtFiles({ title: '雾港来信', intro: '潮水漫过石阶。', htmlBody: '<h2>第一章</h2><p>林渊推门。</p>' });
    expect(Object.keys(files)).toEqual(['mimetype', 'META-INF/manifest.xml', 'content.xml', 'styles.xml']);
    expect(files['mimetype']).toBe(ODT_MIME);
    expect(files['META-INF/manifest.xml']).toContain('content.xml');
    expect(files['content.xml']).toContain('雾港来信');
    expect(files['content.xml']).toContain('林渊推门');
  });

  it('标题按 hN 写入 text:outline-level，正文为 text:p', () => {
    const files = buildOdtFiles({ title: '书', htmlBody: '<h2>第一章</h2><h4>小节</h4><p>正文</p>' });
    const content = files['content.xml'] ?? '';
    expect(content).toContain('<text:h text:outline-level="2">第一章</text:h>');
    expect(content).toContain('<text:h text:outline-level="4">小节</text:h>');
    expect(content).toContain('<text:p>正文</text:p>');
  });

  it('BuildHeadings.level 经 HTML 管线映射为标题层级', () => {
    const profile: BuildProfile = {
      ...DEFAULT_BUILD_PROFILE,
      format: 'html',
      transform: { ...DEFAULT_BUILD_PROFILE.transform, headings: { ...DEFAULT_BUILD_PROFILE.transform.headings, level: 3 } },
    };
    const { text } = runBuild(profile, entities());
    const files = buildOdtFiles({ title: '书', htmlBody: text });
    expect(files['content.xml']).toContain('text:outline-level="3"');
  });

  it('zip 结构：mimetype 为首个本地条目且 STORE 无压缩', () => {
    const files = buildOdtFiles({ title: '雾港来信', intro: '潮水。', htmlBody: '<h2>第一章</h2><p>林渊推门。</p>' });
    const zip = zipStore(files);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // 首个本地文件头签名 + STORE（压缩方法 0）+ 文件名 mimetype
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0);
    const nameLen = view.getUint16(26, true);
    expect(new TextDecoder().decode(zip.subarray(30, 30 + nameLen))).toBe('mimetype');
    const dataStart = 30 + nameLen;
    expect(new TextDecoder().decode(zip.subarray(dataStart, dataStart + ODT_MIME.length))).toBe(ODT_MIME);
    // 中央目录结束记录：4 个条目
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 12, true)).toBe(4);
  });
});
