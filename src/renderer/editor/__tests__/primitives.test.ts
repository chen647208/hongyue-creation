/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWritingPrimitives,
  type RenumberItem,
} from '../primitives';
import { createNovelExtensions } from '../schema';
import { dslToPmDoc } from '../serialization';

/** 构建一个带 schema + 8 原语的无头编辑器（jsdom 下可实例化 ProseMirror）。 */
function makeEditor(body: string, opts: Parameters<typeof createWritingPrimitives>[0] = {}): Editor {
  return new Editor({
    extensions: [...createNovelExtensions(), ...createWritingPrimitives(opts)],
    content: dslToPmDoc(body),
  });
}

function topTypes(editor: Editor): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((n) => out.push(n.type.name));
  return out;
}

function findNode(editor: Editor, typeName: string): { node: PmNode; pos: number } | null {
  let found: { node: PmNode; pos: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!found && node.type.name === typeName) found = { node, pos };
  });
  return found;
}

/** 通过真实 keydown 事件走 ProseMirror 快捷键管线（jsdom 下 view.dom 已挂载监听）。 */
function pressKey(editor: Editor, init: KeyboardEventInit): boolean {
  editor.view.dom.focus();
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  editor.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
}

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

/** 直接驱动 enterFlow 的 Enter 行为核心（等价于快捷键命中，但确定性强）。 */
function handleEnter(e: Editor): boolean {
  return e.commands.handleEnterFlow();
}

describe('enterFlow', () => {
  it('单次 Enter 拆分新段', () => {
    editor = makeEditor('第一段');
    editor.commands.focus('end');
    handleEnter(editor);
    expect(topTypes(editor).filter(t => t === 'paragraph').length).toBeGreaterThanOrEqual(2);
  });

  it('连按两次 Enter 在空段处落 sceneBreak', () => {
    editor = makeEditor('第一段');
    editor.commands.focus('end');
    handleEnter(editor); // 新空段
    handleEnter(editor); // ×2 → sceneBreak
    expect(topTypes(editor)).toContain('sceneBreak');
  });

  it('连按三次 Enter 触发 onNewChapter 回调', () => {
    const onNewChapter = vi.fn();
    editor = makeEditor('第一段', { onNewChapter });
    editor.commands.focus('end');
    handleEnter(editor);
    handleEnter(editor);
    handleEnter(editor); // ×3 → 新章
    expect(onNewChapter).toHaveBeenCalledTimes(1);
  });

  it('非空段上连按两次 Enter 退化为普通换行，不吞正文', () => {
    editor = makeEditor('第一段');
    editor.commands.focus('end');
    handleEnter(editor);
    editor.commands.insertContent('有内容'); // 第二段非空
    handleEnter(editor); // 此时非空 → 普通 enter
    expect(topTypes(editor)).not.toContain('sceneBreak');
  });
});

describe('placeholder (InsertPlaceholder)', () => {
  it('Mod-Shift-X 插入 placeholder 行内原子', () => {
    editor = makeEditor('正文');
    editor.commands.focus('end');
    pressKey(editor, { key: 'x', ctrlKey: true, shiftKey: true });
    const hit = findNode(editor, 'placeholder');
    expect(hit).not.toBeNull();
    expect(hit!.node.attrs.name).toBe('待填');
  });
});

describe('darlings', () => {
  it('选区收割为 darlingSlot，原文存入 attrs', () => {
    editor = makeEditor('保留。要收割的句子。尾巴。');
    const doc = editor.state.doc;
    const text = doc.textBetween(0, doc.content.size, '\n');
    const start = text.indexOf('要收割的句子。');
    const from = doc.resolve(1).start() + start;
    const to = from + '要收割的句子。'.length;
    editor.commands.setTextSelection({ from, to });
    expect(editor.commands.harvestDarling()).toBe(true);
    const hit = findNode(editor, 'darlingSlot');
    expect(hit).not.toBeNull();
    expect(hit!.node.attrs.text).toBe('要收割的句子。');
  });

  it('restoreDarling 把锚点还原为正文文本', () => {
    editor = makeEditor('开头。');
    editor.commands.focus('end');
    editor.commands.insertContent('金句');
    // 先收割
    const doc = editor.state.doc;
    const text = doc.textBetween(0, doc.content.size, '\n');
    const idx = text.indexOf('金句');
    const from = doc.resolve(1).start() + idx;
    editor.commands.setTextSelection({ from, to: from + 2 });
    editor.commands.harvestDarling();
    const slot = findNode(editor, 'darlingSlot');
    expect(slot).not.toBeNull();
    // 再放回
    expect(editor.commands.restoreDarling(slot!.pos)).toBe(true);
    const after = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n');
    expect(after).toContain('金句');
    expect(findNode(editor, 'darlingSlot')).toBeNull();
  });
});

describe('ghostOutline', () => {
  it('insertGhostOutline 铺一条灰色 ghostNote', () => {
    editor = makeEditor('');
    editor.commands.focus('end');
    expect(editor.commands.insertGhostOutline('场景概要：雨夜初遇')).toBe(true);
    const hit = findNode(editor, 'ghostNote');
    expect(hit).not.toBeNull();
    expect(hit!.node.attrs.fromSynopsis).toBe(true);
    expect(hit!.node.textContent).toBe('场景概要：雨夜初遇');
  });

  it('打字即覆盖：输入事务把 ghostNote 转普通段，未触碰的不动', () => {
    editor = makeEditor('');
    editor.commands.focus('end');
    editor.commands.insertGhostOutline('概要甲');
    // 程序化 setContent 不应触发覆盖
    const stillGhost = findNode(editor, 'ghostNote');
    expect(stillGhost).not.toBeNull();
    // 模拟用户在 ghostNote 内输入：插入文本并打 uiEvent=input 元数据
    const hit = findNode(editor, 'ghostNote')!;
    const inner = hit.pos + 1;
    const tr = editor.state.tr.insertText('写', inner, inner).setMeta('uiEvent', 'input');
    editor.view.dispatch(tr);
    expect(findNode(editor, 'ghostNote')).toBeNull();
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n')).toContain('写');
  });
});

describe('typography (NovelTypography)', () => {
  /** 通过 handleTextInput 通道触发输入规则（真实打字路径）。 */
  function typeText(e: Editor, text: string): boolean {
    let handled = false;
    e.view.someProp('handleTextInput', (fn) => {
      const { from, to } = e.state.selection;
      handled = fn(e.view, from, to, text, () => e.state.tr) === true;
      return handled;
    });
    return handled;
  }

  it('--- → ——（em dash）', () => {
    editor = makeEditor('他说');
    editor.commands.focus('end');
    editor.commands.insertContent('--');
    typeText(editor, '-');
    expect(editor.state.doc.textContent).toContain('——');
    expect(editor.state.doc.textContent).not.toContain('---');
  });

  it('... → ……（省略号）', () => {
    editor = makeEditor('等等');
    editor.commands.focus('end');
    editor.commands.insertContent('..');
    typeText(editor, '.');
    expect(editor.state.doc.textContent).toContain('……');
  });

  it('" → “（左弯引号）', () => {
    editor = makeEditor('他说');
    editor.commands.focus('end');
    typeText(editor, '"');
    expect(editor.state.doc.textContent).toContain('“');
    expect(editor.state.doc.textContent).not.toContain('"');
  });
});

describe('spellOnDemand', () => {
  it('默认关闭原生拼写检查（spellcheck=false）', () => {
    editor = makeEditor('正文');
    expect(editor.view.dom.getAttribute('spellcheck')).toBe('false');
  });

  it('setSpellcheck 主动开启后 spellcheck=true', () => {
    editor = makeEditor('正文');
    editor.commands.setSpellcheck(true);
    expect(editor.view.dom.getAttribute('spellcheck')).toBe('true');
    editor.commands.setSpellcheck(false);
    expect(editor.view.dom.getAttribute('spellcheck')).toBe('false');
  });
});

describe('tagDecorate', () => {
  it('@tag 生成 novel-tag-ref 行内装饰，不改动正文文本', () => {
    editor = makeEditor('林渊望向 @苏晚 的方向');
    const before = editor.state.doc.textContent;
    const decorated = editor.view.dom.querySelectorAll('[data-tag-ref]');
    expect(decorated.length).toBeGreaterThanOrEqual(1);
    expect(decorated.item(0)?.getAttribute('data-tag-ref')).toBe('苏晚');
    // 装饰是纯视觉，正文一字未动
    expect(editor.state.doc.textContent).toBe(before);
    expect(before).toContain('@苏晚');
  });

  it('单个字符的 @ 不触发（需 ≥2 字符）', () => {
    editor = makeEditor('邮箱 a@b 不算');
    expect(editor.view.dom.querySelectorAll('[data-tag-ref]').length).toBe(0);
  });
});

describe('chapterRenumber', () => {
  it('重写「第N章」前缀为新序号，无前缀标题不动', () => {
    const received: RenumberItem[] = [];
    editor = makeEditor('正文', { renumber: items => received.push(...items) });
    editor.commands.renumberChapters([
      { id: 'a', index: 0, title: '第5章：启程' },
      { id: 'b', index: 1, title: '第2章：相遇' },
      { id: 'c', index: 2, title: '尾声' },
    ]);
    expect(received.map(r => r.title)).toEqual(['第1章：启程', '第2章：相遇', '尾声']);
  });
});
