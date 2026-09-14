/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 块引用失链装饰（docs/design/45 §4）：行内引用 `blockRef` 的目标不存在时加标记类，
 * 不修改正文与节点属性。项目数据变化由宿主 dispatch 空事务触发重算。
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import type { BlockEmbedResolver } from './blockEmbedNodeView';

export interface BlockRefDecorationOptions {
  resolveBlock: BlockEmbedResolver;
}

export const BlockRefDecorations = Extension.create<BlockRefDecorationOptions>({
  name: 'blockRefDecorations',
  addOptions() {
    return { resolveBlock: () => null };
  },
  addProseMirrorPlugins() {
    const resolve = this.options.resolveBlock;
    return [
      new Plugin({
        key: new PluginKey('blockRefDecorations'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'blockRef') return;
              const id = String(node.attrs.id ?? '');
              const projection = id.length > 0 ? resolve(id) : null;
              if (!projection || !projection.exists) {
                decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'novel-block-ref-broken' }));
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
