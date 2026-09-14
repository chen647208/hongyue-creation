/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 绘本图文页（docs/design/42 §6）。
 *
 * 页结构 = 页序 + 图位 + 图注 + 页面文字；图由外部工具产出，本模块只负责占位与组织。
 * 缺图时渲染占位块而非崩溃或漏页；图位可替换（改 imageId 即换图）。
 * 纯函数，无 IO：只产出 {文件名: 文本内容}，打包复用 core/build/package 与 odt。
 */
import type { PictureBook, PictureBookPage } from '../../shared/types';
import { buildOdtFiles } from './odt.js';
import { buildDocxFiles, buildEpubFiles } from './package.js';

const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 图位解析结果：有图用 src，缺图用 alt 文本占位。 */
export interface PictureSlot {
  src?: string;
  alt: string;
  placeholder: boolean;
}

/** 解析图位：imageId 视为图源（URL/路径）；缺席即占位。 */
export function resolvePictureSlot(page: PictureBookPage): PictureSlot {
  const alt = page.imageAlt?.trim() || page.caption?.trim() || page.title;
  if (page.imageId && page.imageId.trim() !== '') {
    return { src: page.imageId.trim(), alt, placeholder: false };
  }
  return { alt, placeholder: true };
}

/** 单页 HTML：标题 + 图位（缺图为占位块）+ 图注 + 页面文字。 */
export function renderPicturePage(page: PictureBookPage, index: number): string {
  const slot = resolvePictureSlot(page);
  const figure = slot.placeholder
    ? `<div class="picture-placeholder" role="img" aria-label="${xmlEscape(slot.alt)}">${xmlEscape(slot.alt)}</div>`
    : `<img class="picture-image" src="${xmlEscape(slot.src ?? '')}" alt="${xmlEscape(slot.alt)}"/>`;
  const caption = page.caption && page.caption.trim() !== ''
    ? `<figcaption class="picture-caption">${xmlEscape(page.caption.trim())}</figcaption>`
    : '';
  const text = page.text && page.text.trim() !== ''
    ? `<p class="picture-text">${xmlEscape(page.text.trim())}</p>`
    : '';
  return [
    `<section class="picture-page" data-page="${index + 1}">`,
    `<h2 class="picture-page-title">${xmlEscape(page.title)}</h2>`,
    `<figure class="picture-figure">${figure}${caption}</figure>`,
    text,
    '</section>',
  ]
    .filter((part) => part !== '')
    .join('\n');
}

/** 绘本正文 HTML（所有页）；缺图页照常产出占位。 */
export function buildPictureBookHtml(book: PictureBook | undefined): string {
  return (book?.pages ?? []).map((page, index) => renderPicturePage(page, index)).join('\n');
}

/** 纯文本页文案：`第N页 标题` + 图注 + 页面文字。 */
export function buildPictureBookText(book: PictureBook | undefined): string {
  return (book?.pages ?? [])
    .map((page, index) => {
      const slot = resolvePictureSlot(page);
      const imageLine = slot.placeholder ? `[缺图：${slot.alt}]` : `[图：${slot.alt}]`;
      return [`第${index + 1}页 ${page.title}`, imageLine, page.caption ?? '', page.text].filter((line) => line !== '').join('\n');
    })
    .join('\n\n');
}

/**
 * 绘本文件集：html 产独立网页，odt/docx/epub 复用出版封装器。
 * 图位在缺图时显示占位块，打包器按 h/p/div 子集识别，不改变页数。
 */
export function buildPictureBookFiles(
  book: PictureBook | undefined,
  format: 'html' | 'odt' | 'docx' | 'epub',
  title = '绘本',
): Record<string, string> {
  const htmlBody = buildPictureBookHtml(book);
  if (format === 'odt') return buildOdtFiles({ title, htmlBody });
  if (format === 'docx') return buildDocxFiles({ title, htmlBody });
  if (format === 'epub') return buildEpubFiles({ title, htmlBody });
  return {
    'index.html': [
      '<!DOCTYPE html>',
      '<html lang="zh-CN"><head><meta charset="utf-8">',
      `<title>${xmlEscape(title)}</title>`,
      '<style>.picture-page{margin-bottom:2rem} .picture-placeholder{border:1px dashed #999;padding:2rem;text-align:center;color:#666}</style>',
      '</head><body>',
      htmlBody,
      '</body></html>',
      '',
    ].join('\n'),
  };
}
