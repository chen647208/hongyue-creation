/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { PictureBook } from '../../../shared/types';
import {
  buildPictureBookFiles,
  buildPictureBookHtml,
  buildPictureBookText,
  renderPicturePage,
  resolvePictureSlot,
} from '../index.js';

const book: PictureBook = {
  pages: [
    { id: 'p1', title: '第一页', imageAlt: '月亮', caption: '夜色', text: '月亮升起来了。' },
    { id: 'p2', title: '第二页', imageId: 'https://cdn.example.com/sun.png', imageAlt: '太阳', text: '太阳落下。' },
  ],
};

describe('绘本页结构与图位', () => {
  it('缺图页渲染占位块而非崩溃', () => {
    const html = renderPicturePage(book.pages[0]!, 0);
    expect(html).toContain('class="picture-placeholder"');
    expect(html).toContain('月亮');
    expect(html).not.toContain('<img');
  });

  it('有图页渲染 img 且图位可替换', () => {
    const html = renderPicturePage(book.pages[1]!, 1);
    expect(html).toContain('src="https://cdn.example.com/sun.png"');
    expect(html).toContain('alt="太阳"');
    const replaced = resolvePictureSlot({ ...book.pages[1]!, imageId: 'new.png' });
    expect(replaced.src).toBe('new.png');
    expect(replaced.placeholder).toBe(false);
  });

  it('页面文本与图注转义，脚本不入 HTML', () => {
    const html = buildPictureBookHtml({
      pages: [{ id: 'x', title: '<标题>', imageId: 'a.png', text: '<script>alert(1)</script>' }],
    });
    expect(html).toContain('&lt;标题&gt;');
    expect(html).not.toContain('<script>');
  });

  it('图文页导出 html/odt 均含全部页且保留占位', () => {
    const html = buildPictureBookFiles(book, 'html')['index.html'] ?? '';
    expect(html).toContain('picture-placeholder');
    expect(html).toContain('太阳落下。');
    const odt = buildPictureBookFiles(book, 'odt')['content.xml'] ?? '';
    expect(odt).toContain('第一页');
    expect(odt).toContain('第二页');
    expect(odt).toContain('月亮');
  });

  it('纯文本导出标注缺图与页序', () => {
    const text = buildPictureBookText(book);
    expect(text).toContain('第1页 第一页');
    expect(text).toContain('[缺图：月亮]');
    expect(text).toContain('[图：太阳]');
  });
});
