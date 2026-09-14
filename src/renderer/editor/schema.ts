/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 小说文档 TipTap schema（06 篇 §1.1，公理「schema 先行」）。
 *
 * 节点名与 serialization.ts 的 PM-JSON 契约严格对齐：
 *   doc/paragraph/heading(1-3)/hardBreak/text 由 StarterKit 提供；
 *   sceneBreak/keywordLine/chapterRef/placeholder/darlingSlot/ghostNote/dialogueBlock 自定义；
 *   marks: quoteStyle/tagRef（StarterKit 另提供 bold/italic 等，仅编辑器态，不落 DSL）。
 *
 * 编辑器 getJSON() 产出即 serialization 的 PmNode 结构，正文与 DSL 文本经 pmDocToDsl/dslToPmDoc 往返。
 */

import { type Extensions,Mark, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

import { BlockId } from './blockId';

/** 场景分隔（*** 行；Enter×2 产物）——块级叶节点 */
export const SceneBreak = Node.create({
  name: 'sceneBreak',
  group: 'block',
  atom: true,
  renderHTML() {
    return ['hr', { 'data-scene-break': '', class: 'novel-scene-break' }];
  },
  parseHTML() {
    return [{ tag: 'hr[data-scene-break]' }];
  },
});

/** 关键字行（# @role: value）——块级叶节点，承载 DSL 声明/引用 */
export const KeywordLine = Node.create({
  name: 'keywordLine',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      keyword: { default: '' },
      value: { default: '' },
    };
  },
  renderHTML({ node }) {
    return [
      'p',
      { 'data-keyword': String(node.attrs.keyword ?? ''), class: 'novel-keyword' },
      `# @${node.attrs.keyword ?? ''}: ${node.attrs.value ?? ''}`,
    ];
  },
  parseHTML() {
    return [{ tag: 'p[data-keyword]' }];
  },
});

/** 硬链接 [[tag|display]]——行内原子节点，改名联动 */
export const ChapterRef = Node.create({
  name: 'chapterRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      tag: { default: '' },
      display: { default: null },
    };
  },
  renderHTML({ node }) {
    const tag = String(node.attrs.tag ?? '');
    const display = node.attrs.display ? String(node.attrs.display) : tag;
    return ['a', { 'data-chapter-ref': tag, class: 'novel-chapter-ref', href: '#' }, display];
  },
  parseHTML() {
    return [{ tag: 'a[data-chapter-ref]' }];
  },
});

/** NEO 式占位符 {name|kind}——行内原子节点，装饰红点 */
export const PlaceholderNode = Node.create({
  name: 'placeholder',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      name: { default: '' },
      kind: { default: null },
    };
  },
  renderHTML({ node }) {
    const name = String(node.attrs.name ?? '');
    const kind = node.attrs.kind ? String(node.attrs.kind) : '';
    return [
      'span',
      { 'data-placeholder': name, 'data-placeholder-kind': kind, class: 'novel-placeholder' },
      kind ? `{${name}|${kind}}` : `{${name}}`,
    ];
  },
  parseHTML() {
    return [{ tag: 'span[data-placeholder]' }];
  },
});

/** 弃稿锚点（拖出时原位留痕）——块级叶节点 */
export const DarlingSlot = Node.create({
  name: 'darlingSlot',
  group: 'block',
  atom: true,
  addAttributes() {
    return { text: { default: '' } };
  },
  renderHTML({ node }) {
    return ['div', { 'data-darling-slot': '', class: 'novel-darling-slot' }, String(node.attrs.text ?? '')];
  },
  parseHTML() {
    return [{ tag: 'div[data-darling-slot]' }];
  },
});

/** 幽灵大纲：灰色可覆盖段落（来自 Node.attrs.synopsis）——块级可编辑 */
export const GhostNote = Node.create({
  name: 'ghostNote',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return { fromSynopsis: { default: false } };
  },
  renderHTML() {
    return ['p', { 'data-ghost': '', class: 'novel-ghost-note' }, 0];
  },
  parseHTML() {
    return [{ tag: 'p[data-ghost]' }];
  },
});

/** 对话块（Fountain 启发：角色行+对白，导出/统计可识别）——块级可编辑 */
export const DialogueBlock = Node.create({
  name: 'dialogueBlock',
  group: 'block',
  content: 'inline*',
  addAttributes() {
    return { speaker: { default: null } };
  },
  renderHTML({ node }) {
    return ['p', { 'data-dialogue': '', 'data-speaker': node.attrs.speaker ?? '', class: 'novel-dialogue' }, 0];
  },
  parseHTML() {
    return [{ tag: 'p[data-dialogue]' }];
  },
});

/** 弯引号态标记 */
export const QuoteStyle = Mark.create({
  name: 'quoteStyle',
  renderHTML() {
    return ['span', { 'data-quote-style': '', class: 'novel-quote' }, 0];
  },
  parseHTML() {
    return [{ tag: 'span[data-quote-style]' }];
  },
});

/** @tag 软引用高亮标记（不碰正文，仅视觉） */
export const TagRef = Mark.create({
  name: 'tagRef',
  addAttributes() {
    return { tag: { default: null } };
  },
  renderHTML({ mark }) {
    return ['span', { 'data-tag-ref': mark.attrs.tag ?? '', class: 'novel-tag-ref' }, 0];
  },
  parseHTML() {
    return [{ tag: 'span[data-tag-ref]' }];
  },
});

/**
 * 装配小说编辑器扩展集。StarterKit 关闭历史/撤销以外的默认多余项由上层按需覆盖；
 * 此处保留 StarterKit 默认（含 History），单一事务管线在其上叠加。
 */
export function createNovelExtensions(options: { undoRedo?: boolean } = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      undoRedo: options.undoRedo === false ? false : undefined,
    }),
    SceneBreak,
    KeywordLine,
    ChapterRef,
    PlaceholderNode,
    DarlingSlot,
    GhostNote,
    DialogueBlock,
    QuoteStyle,
    TagRef,
    BlockId,
  ];
}
