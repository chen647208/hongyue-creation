/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 剧本自动格式化：按行判定元素类型并施加加粗/斜体标记。
 * 元素分类为纯函数，插件只在文档变化时同步段落标记。
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export type ScreenplayElement = 'scene_heading' | 'character' | 'parenthetical' | 'transition' | 'action';

const SCENE_HEADING = /^(INT\.|EXT\.|INT\/EXT|INT\.\/EXT|EST\.|内景|外景)/i;
const TRANSITION = /^(CUT TO:|FADE (IN|OUT)|DISSOLVE TO:|SMASH CUT TO:|匹配剪辑|切至)[:：]?/i;
const PARENTHETICAL = /^[（(].*[)）]$/;
const LATIN_CUE = /^[A-Z0-9][A-Z0-9 .'#-]{1,30}$/;
const CJK_CUE = /^[^\s]{1,12}[：:]$/;

/** 判定单行属于哪种剧本元素。 */
export function classifyScreenplayLine(raw: string): ScreenplayElement {
  const text = raw.trim();
  if (!text) return 'action';
  if (SCENE_HEADING.test(text)) return 'scene_heading';
  if (TRANSITION.test(text)) return 'transition';
  if (PARENTHETICAL.test(text)) return 'parenthetical';
  if (LATIN_CUE.test(text) && /[A-Z]/.test(text)) return 'character';
  if (CJK_CUE.test(text)) return 'character';
  return 'action';
}

export const screenplayFormattingKey = new PluginKey('screenplayFormatting');

/** 自动格式化扩展：文档变化后把段落标记同步为元素对应样式。 */
export function createScreenplayFormatting(): Extension {
  return Extension.create({
    name: 'screenplayFormatting',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: screenplayFormattingKey,
          appendTransaction: (transactions, _oldState, newState) => {
            if (!transactions.some((transaction) => transaction.docChanged)) return null;
            const bold = newState.schema.marks.bold;
            const italic = newState.schema.marks.italic;
            const boldMark = bold?.create();
            const italicMark = italic?.create();
            const tr = newState.tr;
            let changed = false;
            newState.doc.descendants((node, pos) => {
              if (node.type.name !== 'paragraph') return;
              const text = node.textContent;
              if (!text.trim()) return;
              const element = classifyScreenplayLine(text);
              const wantBold = element === 'scene_heading' || element === 'character' || element === 'transition';
              const wantItalic = element === 'parenthetical';
              let hasBold = false;
              let hasItalic = false;
              node.forEach((child) => {
                if (!child.isText) return;
                if (child.marks.some((mark) => mark.type.name === 'bold')) hasBold = true;
                if (child.marks.some((mark) => mark.type.name === 'italic')) hasItalic = true;
              });
              if (hasBold === wantBold && hasItalic === wantItalic) return;
              const from = pos + 1;
              const to = pos + node.content.size + 1;
              if (bold) tr.removeMark(from, to, bold);
              if (italic) tr.removeMark(from, to, italic);
              if (wantBold && boldMark) tr.addMark(from, to, boldMark);
              if (wantItalic && italicMark) tr.addMark(from, to, italicMark);
              changed = true;
            });
            if (!changed) return null;
            tr.setMeta('addToHistory', false);
            return tr;
          },
        }),
      ];
    },
  });
}
