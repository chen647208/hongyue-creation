/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 行内批注装饰（docs/design/38 §2.2）：按块标识 + 块内纯文本偏移给正文加标记类，
 * 不修改正文与节点属性。批注数据变化由宿主 dispatch 空事务触发重算。
 *
 * 偏移口径与 blockIndex.blockText 一致（行内原子节点按显示文本计长），因此锚点
 * 不随块重排漂移；块内文字改动后由宿主用 annotations.ts 重新定位，失锚的不再装饰。
 */

import { formatBlockEmbed, formatBlockRef } from '@core/dsl/blockRef';
import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { BLOCK_ID_ATTRIBUTE } from './blockIndex';

/** 待装饰的批注范围（已由宿主解析；只传未解决且已锚定的）。 */
export interface AnnotationDecorationInput {
  annotationId: string;
  blockId: string;
  start: number;
  end: number;
}

export interface AnnotationDecorationsOptions {
  /** 返回当前待装饰范围；项目数据变化后由宿主 dispatch 空事务触发重算。 */
  getAnnotations: () => readonly AnnotationDecorationInput[];
}

/** 行内原子节点在纯文本中的显示长度口径（与 blockIndex.blockText 对齐）。 */
function leafText(node: ProseMirrorNode): string {
  switch (node.type.name) {
    case 'hardBreak':
      return '\n';
    case 'chapterRef': {
      const display = node.attrs.display;
      const tag = node.attrs.tag;
      return typeof display === 'string' && display.length > 0 ? display : String(tag ?? '');
    }
    case 'placeholder': {
      const name = String(node.attrs.name ?? '');
      const kind = node.attrs.kind;
      return typeof kind === 'string' && kind.length > 0 ? `{${name}|${kind}}` : `{${name}}`;
    }
    case 'blockRef':
      return formatBlockRef(String(node.attrs.id ?? ''));
    case 'blockEmbed':
      return formatBlockEmbed(String(node.attrs.id ?? ''));
    default:
      return node.isText ? node.text ?? '' : '';
  }
}

/** 块内纯文本（与 blockIndex.blockText 口径一致）。 */
export function blockPlainText(node: ProseMirrorNode): string {
  let text = '';
  node.forEach((child) => {
    text += child.isText ? child.text ?? '' : leafText(child);
  });
  return text;
}

/** 块内纯文本总长。 */
function blockPlainLength(node: ProseMirrorNode): number {
  return blockPlainText(node).length;
}

/**
 * ProseMirror 文档位置 → 块内纯文本偏移（getSelectionAnchor 用）。
 * 位置落在行内原子节点内部时，偏移对齐到该节点纯文本起点。
 */
export function docPosToPlainOffset(block: ProseMirrorNode, blockPos: number, pos: number): number {
  const contentStart = blockPos + 1;
  let acc = 0;
  let result: number | null = null;
  block.forEach((child, childOffset) => {
    if (result !== null) return;
    const childStart = contentStart + childOffset;
    const length = child.isText ? child.text?.length ?? 0 : leafText(child).length;
    if (pos <= childStart + child.nodeSize) {
      result = acc + Math.max(0, Math.min(pos - childStart, length));
      return;
    }
    acc += length;
  });
  return result ?? acc;
}

/**
 * 块内纯文本偏移 → ProseMirror 文档位置。超出块尾回落到内容末位；
 * 偏移落在行内原子节点内部时对齐到该节点起点。
 */
export function plainOffsetToDocPos(block: ProseMirrorNode, blockPos: number, offset: number): number {
  const contentStart = blockPos + 1;
  let result: number | null = null;
  let acc = 0;
  block.forEach((child, childOffset) => {
    if (result !== null) return;
    const length = child.isText ? child.text?.length ?? 0 : leafText(child).length;
    if (offset <= acc + length) {
      result = contentStart + childOffset + Math.min(offset - acc, child.nodeSize);
      return;
    }
    acc += length;
  });
  return result ?? contentStart + block.content.size;
}

/** 在文档中建立块标识 → 节点与位置的索引。 */
function indexBlocks(doc: ProseMirrorNode): Map<string, { node: ProseMirrorNode; pos: number }> {
  const map = new Map<string, { node: ProseMirrorNode; pos: number }>();
  doc.descendants((node, pos) => {
    const id = node.attrs?.[BLOCK_ID_ATTRIBUTE];
    if (typeof id === 'string' && id.length > 0 && !map.has(id)) map.set(id, { node, pos });
    return true;
  });
  return map;
}

export const AnnotationDecorations = Extension.create<AnnotationDecorationsOptions>({
  name: 'annotationDecorations',
  addOptions() {
    return { getAnnotations: () => [] };
  },
  addProseMirrorPlugins() {
    const getAnnotations = this.options.getAnnotations;
    return [
      new Plugin({
        key: new PluginKey('annotationDecorations'),
        props: {
          decorations(state) {
            const inputs = getAnnotations();
            if (inputs.length === 0) return DecorationSet.empty;
            const blocks = indexBlocks(state.doc);
            const decorations: Decoration[] = [];
            for (const input of inputs) {
              const target = blocks.get(input.blockId);
              if (!target) continue;
              const max = blockPlainLength(target.node);
              const start = Math.max(0, Math.min(input.start, max));
              const end = Math.max(start, Math.min(input.end, max));
              if (end <= start) continue;
              const from = plainOffsetToDocPos(target.node, target.pos, start);
              const to = plainOffsetToDocPos(target.node, target.pos, end);
              if (to <= from) continue;
              try {
                decorations.push(
                  Decoration.inline(from, to, {
                    class: 'novel-annotation',
                    'data-annotation-id': input.annotationId,
                  }),
                );
              } catch {
                // 位置越界（并发编辑瞬时态）跳过该处
              }
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
