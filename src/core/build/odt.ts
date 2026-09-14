/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * ODT 封装纯函数（docs/design/39）：HTML 正文 → ODF 文本文件集。
 * 与 ePub/DOCX 同构：只产出 {文件名: 文本内容}，zip 打包复用同目录 STORE 打包器
 * （zipStore.ts，落盘在主进程），不引第三方依赖。
 * mimetype 必须为首个条目且无压缩，由 zipStore 的顺序保留与 STORE 方式满足。
 */
import type { PackageInput } from './package.js';

/** ODF 媒体类型：mimetype 条目内容与 manifest 根条目一致。 */
const ODT_MIME = 'application/vnd.oasis.opendocument.text';

const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const decodeEntities = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

interface OdtBlock {
  text: string;
  /** 0=正文段落；1..6=标题层级（text:outline-level）。 */
  level: number;
}

/** HTML 子集（h1..h6/p/div/li）→ ODF 块；标题保留层级，<br> 折为段内换行。 */
export function htmlToOdtBlocks(html: string): OdtBlock[] {
  const normalized = html.replace(/<br\s*\/?>/gi, '\n');
  const out: OdtBlock[] = [];
  const re = /<(h[1-6]|p|div|li)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  let consumed = false;
  while ((m = re.exec(normalized)) !== null) {
    consumed = true;
    const tag = (m[1] ?? '').toLowerCase();
    const inner = decodeEntities((m[3] ?? '').replace(/<[^>]+>/g, ''));
    if (!inner.trim()) continue;
    out.push({ text: inner, level: tag.startsWith('h') ? Number(tag.slice(1)) : 0 });
  }
  if (!consumed) {
    for (const part of normalized.split(/\n\s*\n/).map((s) => decodeEntities(s.replace(/<[^>]+>/g, ''))).filter((s) => s.trim())) {
      out.push({ text: part, level: 0 });
    }
  }
  return out;
}

/** 段内换行转 text:line-break；文本转义后拼为 ODF 段落或标题。 */
function blockXml(block: OdtBlock): string {
  const inline = block.text.split('\n').map(xmlEscape).join('<text:line-break/>');
  if (block.level >= 1 && block.level <= 6) {
    return `<text:h text:outline-level="${block.level}">${inline}</text:h>`;
  }
  return `<text:p>${inline}</text:p>`;
}

function buildContentXml(blocks: OdtBlock[]): string {
  const body = blocks.map(blockXml).join('');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">',
    '<office:automatic-styles/>',
    `<office:body><office:text>${body}</office:text></office:body>`,
    '</office:document-content>',
    '',
  ].join('\n');
}

const STYLES_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">',
  '<office:styles/>',
  '<office:automatic-styles/>',
  '<office:master-styles/>',
  '</office:document-styles>',
  '',
].join('\n');

const MANIFEST_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">',
  `<manifest:file-entry manifest:full-path="/" manifest:media-type="${ODT_MIME}"/>`,
  '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
  '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>',
  '</manifest:manifest>',
  '',
].join('\n');

/**
 * ODT 文件集：mimetype 首项、manifest、content、styles。
 * 首部书名与简介由本函数统一添加，调用方传入的 htmlBody 为章节正文。
 */
export function buildOdtFiles(input: PackageInput): Record<string, string> {
  const title = input.title || 'Untitled';
  const blocks: OdtBlock[] = [{ text: title, level: 1 }];
  if (input.intro?.trim()) blocks.push({ text: input.intro.trim(), level: 0 });
  blocks.push(...htmlToOdtBlocks(input.htmlBody));
  return {
    'mimetype': ODT_MIME,
    'META-INF/manifest.xml': MANIFEST_XML,
    'content.xml': buildContentXml(blocks),
    'styles.xml': STYLES_XML,
  };
}
