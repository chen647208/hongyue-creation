/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 块级稳定标识（docs/design/45 §3）：为块级节点维护 `blockId` 属性。
 *
 * 生命周期：
 *   - 新建块（含 Enter 拆分）：属性默认空缺，插件补发标识；
 *   - 已存在块：只补不发，标识不变；
 *   - 剪切/重排/内部复制粘贴：属性随节点走，标识保留；
 *   - 外部粘贴：外来内容无 `data-block-id`，补发新标识；
 *   - 重复标识（复制或跨章粘贴）：仅保留首个，其余补发，避免指向同一块。
 *
 * 存储边界：正文以 DSL 文本落库（见 serialization.ts），DSL 不编码本属性，
 * 因此标识只在当前编辑会话（及 Yjs 协作副本）内存活，重载章节后重新生成。
 */

import { uuidv7 } from '@core/entities';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { BLOCK_ID_ATTRIBUTE } from './blockIndex';

/** 承载标识的块级节点类型（与 schema.ts 及 StarterKit 的块节点对齐）。 */
export const DEFAULT_BLOCK_ID_TYPES: readonly string[] = [
  'paragraph',
  'heading',
  'ghostNote',
  'dialogueBlock',
  'sceneBreak',
  'keywordLine',
  'darlingSlot',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
];

/** 初始文档规范化事务的元标记：编辑器创建时不经过事务，appendTransaction 不会自触发。 */
export const BLOCK_ID_INIT_META = 'blockIdInit';

export interface BlockIdPluginOptions {
  /** 参与标识维护的块级节点类型名。 */
  types: readonly string[];
  /** 标识生成器（默认 uuidv7；测试注入确定性实现）。 */
  generateId: () => string;
}

/**
 * 规范化插件：补齐缺失标识、去重重复标识，不覆盖已存在的唯一标识。
 * 设置节点属性不改变节点尺寸，遍历期间位置保持有效。
 */
export function createBlockIdPlugin(options: BlockIdPluginOptions): Plugin {
  const typeSet = new Set(options.types);
  return new Plugin({
    key: new PluginKey('blockId'),
    appendTransaction: (transactions, _oldState, newState) => {
      const triggered = transactions.some(
        (tr) => tr.docChanged || tr.getMeta(BLOCK_ID_INIT_META) === true,
      );
      if (!triggered) return null;

      let tr = newState.tr;
      let modified = false;
      const seen = new Set<string>();
      newState.doc.descendants((node, pos) => {
        if (!typeSet.has(node.type.name)) return;
        const current = node.attrs[BLOCK_ID_ATTRIBUTE];
        if (typeof current === 'string' && current.length > 0 && !seen.has(current)) {
          seen.add(current);
          return;
        }
        const id = options.generateId();
        seen.add(id);
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, [BLOCK_ID_ATTRIBUTE]: id });
        modified = true;
      });
      return modified ? tr : null;
    },
  });
}

export interface BlockIdOptions {
  types: readonly string[];
  generateId: () => string;
}

/**
 * 块标识扩展：注册全局属性 `blockId` 并挂规范化插件。
 * 加入 createNovelExtensions 后，普通与协作编辑器同时生效。
 */
export const BlockId = Extension.create<BlockIdOptions>({
  name: 'blockId',
  addOptions() {
    return { types: DEFAULT_BLOCK_ID_TYPES, generateId: uuidv7 };
  },
  addGlobalAttributes() {
    return [
      {
        types: [...this.options.types],
        attributes: {
          [BLOCK_ID_ATTRIBUTE]: {
            // 缺省 undefined：JSON.stringify 丢弃该键，DSL 与既有序列化结果不变。
            default: undefined,
            // 拆分时新块不继承标识（新块补发），原块保留。
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) => {
              const id = attributes[BLOCK_ID_ATTRIBUTE];
              return typeof id === 'string' && id.length > 0 ? { 'data-block-id': id } : {};
            },
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [createBlockIdPlugin({ types: this.options.types, generateId: this.options.generateId })];
  },
  onCreate() {
    // 初始文档由 EditorState.create 直接构造，未经事务；补一次规范化，令首屏即可查询到标识。
    this.editor.view?.dispatch(this.editor.state.tr.setMeta(BLOCK_ID_INIT_META, true));
  },
});
