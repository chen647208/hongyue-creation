/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 块索引：从 ProseMirror 文档 JSON 提取块级标识与纯文本摘要。
 *
 * 纯函数、不依赖编辑器实例，供引用面板与单测使用。文档（PM-JSON）中块节点的
 * `blockId` 属性由 blockId.ts 的编辑器扩展维护；DSL 文本经 serialization.ts 的
 * 块锚（`^<id>`）读写该属性，缺失标识的块 id 为 null。
 */

import { formatBlockEmbed, formatBlockRef } from '@core/dsl/blockRef';

import { BLOCK_ID_ATTRIBUTE, dslToPmDoc, type PmNode } from './serialization';

export { BLOCK_ID_ATTRIBUTE };

/** 摘要最大字符数，超出截断并追加省略号。 */
export const BLOCK_SUMMARY_MAX_LENGTH = 120;

/** 顶层块记录。 */
export interface BlockRecord {
  /** 稳定标识；文档无该属性（如从 DSL 文本解析）时为 null。 */
  id: string | null;
  /** 节点类型名（paragraph / heading / sceneBreak / keywordLine …）。 */
  type: string;
  /** 纯文本摘要：行内引用取显示名，占位符取名字，场景分隔记为 ***。 */
  text: string;
}

function inlineText(nodes: PmNode[] | undefined): string {
  if (!nodes) return '';
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out += node.text ?? '';
        break;
      case 'hardBreak':
        out += '\n';
        break;
      case 'chapterRef': {
        const display = node.attrs?.display;
        const tag = node.attrs?.tag;
        out += typeof display === 'string' && display.length > 0 ? display : String(tag ?? '');
        break;
      }
      case 'placeholder': {
        const name = String(node.attrs?.name ?? '');
        const kind = node.attrs?.kind;
        out += typeof kind === 'string' && kind.length > 0 ? `{${name}|${kind}}` : `{${name}}`;
        break;
      }
      case 'blockRef':
        out += formatBlockRef(String(node.attrs?.id ?? ''));
        break;
      case 'blockEmbed':
        out += formatBlockEmbed(String(node.attrs?.id ?? ''));
        break;
      default:
        out += inlineText(node.content);
    }
  }
  return out;
}

/** 单个块节点的纯文本（不含格式）。 */
export function blockText(node: PmNode): string {
  switch (node.type) {
    case 'sceneBreak':
      return '***';
    case 'keywordLine':
      return `# @${String(node.attrs?.keyword ?? '')}: ${String(node.attrs?.value ?? '')}`.trimEnd();
    case 'darlingSlot':
      return String(node.attrs?.text ?? '');
    case 'blockEmbed':
      return formatBlockEmbed(String(node.attrs?.id ?? ''));
    default:
      return inlineText(node.content);
  }
}

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > BLOCK_SUMMARY_MAX_LENGTH ? `${flat.slice(0, BLOCK_SUMMARY_MAX_LENGTH)}…` : flat;
}

function toRecord(node: PmNode): BlockRecord {
  const id = node.attrs?.[BLOCK_ID_ATTRIBUTE];
  return {
    id: typeof id === 'string' && id.length > 0 ? id : null,
    type: node.type,
    text: truncate(blockText(node)),
  };
}

/** 列出文档顶层块（id + 类型 + 摘要），不递归容器内部块。 */
export function listBlocks(doc: PmNode): BlockRecord[] {
  return (doc.content ?? []).map(toRecord);
}

/** 按标识查找顶层块；未命中返回 null。 */
export function findBlockById(doc: PmNode, id: string): BlockRecord | null {
  return listBlocks(doc).find((block) => block.id === id) ?? null;
}

/** 文档中已存在的块标识，按出现顺序返回（不去重）。 */
export function collectBlockIds(doc: PmNode): string[] {
  return listBlocks(doc)
    .map((block) => block.id)
    .filter((id): id is string => id !== null);
}

/**
 * 章节 body（DSL 文本）→ 顶层块记录。
 *
 * 带块锚的块经 serialization.ts 还原出 blockId；无锚的块 id 为 null。
 */
export function listBlocksFromBody(body: string): BlockRecord[] {
  return listBlocks(dslToPmDoc(body));
}
