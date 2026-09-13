/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { EditorContent, useEditor } from '@tiptap/react';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/utils/cn';

import { createCollaborativeExtensions } from '../../../editor/collaborative';
import { findMatches } from '../../../editor/findReplace';
import { createWritingPrimitives } from '../../../editor/primitives';
import { createNovelExtensions } from '../../../editor/schema';
import { createScreenplayFormatting } from '../../../editor/screenplay';
import { dslToPmDoc, pmDocToDsl, type PmNode } from '../../../editor/serialization';
import type { EditorCollaboration, NovelEditorHandle } from '../types';

/** 远端光标渲染：竖线 + 名字标签。 */
function renderRemoteCaret(user: { name?: string; color?: string }): HTMLElement {
  const color = user.color ?? '#0091ff';
  const caret = document.createElement('span');
  caret.style.borderLeft = `2px solid ${color}`;
  caret.style.marginLeft = '-1px';
  caret.style.marginRight = '-1px';
  caret.style.pointerEvents = 'none';
  caret.style.position = 'relative';
  const label = document.createElement('span');
  label.textContent = user.name ?? '';
  label.style.position = 'absolute';
  label.style.left = '-2px';
  label.style.top = '-1.1em';
  label.style.backgroundColor = color;
  label.style.color = '#fff';
  label.style.fontSize = '10px';
  label.style.lineHeight = '1.2';
  label.style.padding = '0 3px';
  label.style.borderRadius = '3px';
  label.style.whiteSpace = 'nowrap';
  caret.appendChild(label);
  return caret;
}

function renderRemoteSelection(user: { color?: string }): { nodeName: string; class: string; style: string } {
  return { nodeName: 'span', class: 'collaboration-selection', style: `background-color: ${user.color ?? '#0091ff'}33` };
}

interface TipTapCanvasProps {
  content: string;
  activeChapterId: string | null;
  /** 定稿锁定：正文只读。 */
  locked?: boolean;
  /** 协作模式：文档绑到 Y.XmlFragment，远端改动实时合并，撤销走 yUndoPlugin。 */
  collaboration?: EditorCollaboration | null;
  isFocusMode: boolean;
  /** 生成中且非流式时锁定编辑；流式期间以只读方式回显增量。 */
  isGenerating: boolean;
  isStreaming: boolean;
  /** 剧本自动格式化：按元素类型同步加粗/斜体标记。 */
  screenplayFormat?: boolean;
  /** 打字机模式：光标保持在视口中部跟随滚动。 */
  typewriter?: boolean;
  /** Enter×3 连按：宿主创建新章并切换（不阻塞继续输入）。 */
  onNewChapter?: () => void;
  onContentChange: (content: string) => void;
  onMouseUp: (event: React.MouseEvent<HTMLDivElement>) => void;
  onKeyUp: () => void;
  onMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * 小说 DSL 富文本画布：把受控的 DSL 字符串与 ProseMirror 文档双向同步，
 * 并通过 NovelEditorHandle 向编排层暴露 PM 语义的选区与坐标。
 * 传入 collaboration 时改为 y-prosemirror 节点级绑定。
 */
const TipTapCanvas = forwardRef<NovelEditorHandle, TipTapCanvasProps>(function TipTapCanvas(
  { content, activeChapterId, locked, collaboration, screenplayFormat, isFocusMode, isGenerating, isStreaming, typewriter, onNewChapter, onContentChange, onMouseUp, onKeyUp, onMouseMove },
  ref,
) {
  const { t } = useTranslation('writing');
  const collaborative = Boolean(collaboration);
  // 回调经 ref 传递，避免每次渲染重建编辑器实例。
  const onChangeRef = useRef(onContentChange);
  onChangeRef.current = onContentChange;
  const onNewChapterRef = useRef(onNewChapter);
  onNewChapterRef.current = onNewChapter;
  // 记录最近一次由本编辑器吐出的 DSL，用于区分「外部受控更新」与「自身回环」。
  const lastEmitted = useRef<string>(content);
  const [isEmpty, setIsEmpty] = useState(() => content.trim().length === 0);

  // schema 节点 + 8 写作原语（enterFlow 的新章回调经 ref 转发，保持扩展集稳定不重建）。
  // 协作模式另加 y-prosemirror 同步/光标/撤销插件，并关闭 StarterKit 的 History。
  const fragment = collaboration?.fragment;
  const awareness = collaboration?.awareness;
  const extensions = useMemo(
    () => [
      ...(collaborative ? createCollaborativeExtensions() : createNovelExtensions()),
      ...createWritingPrimitives({ onNewChapter: () => onNewChapterRef.current?.() }),
      ...(screenplayFormat ? [createScreenplayFormatting()] : []),
      ...(fragment && awareness
        ? [
            Collaboration.configure({ fragment }),
            CollaborationCaret.configure({
              provider: { awareness },
              user: { name: '协作者', color: '#0091ff' },
              render: renderRemoteCaret,
              selectionRender: renderRemoteSelection,
            }),
          ]
        : []),
    ],
    [collaborative, fragment, awareness, screenplayFormat],
  );

  const editor = useEditor(
    {
      extensions,
      content: collaborative ? undefined : dslToPmDoc(content),
      editable: !!activeChapterId && !locked && !(isGenerating && !isStreaming),
      onUpdate: ({ editor: e }) => {
        const dsl = pmDocToDsl(e.getJSON() as PmNode);
        lastEmitted.current = dsl;
        setIsEmpty(dsl.trim().length === 0);
        onChangeRef.current(dsl);
      },
    },
    [fragment, collaborative],
  );

  // 受控同步：外部 content 变化（切章、流式增量、AI 回写）时刷新文档，
  // 但跳过自身 onUpdate 刚吐出的值，防止光标跳动与回环。协作模式由 y-prosemirror 接管。
  useEffect(() => {
    if (!editor || collaborative) return;
    if (content === lastEmitted.current) return;
    lastEmitted.current = content;
    setIsEmpty(content.trim().length === 0);
    editor.commands.setContent(dslToPmDoc(content), { emitUpdate: false });
  }, [content, editor, collaborative]);

  // 可编辑态：无章节或生成中（非流式）时锁定。
  useEffect(() => {
    if (!editor) return;
    const editable = !!activeChapterId && !locked && !(isGenerating && !isStreaming);
    if (editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, activeChapterId, locked, isGenerating, isStreaming]);

  // 打字机模式：选区变化时把光标收到视口约 40% 高度处，长文连写不沉底。
  const typewriterRef = useRef(typewriter);
  typewriterRef.current = typewriter;
  useEffect(() => {
    if (!editor) return;
    const centerCaret = () => {
      if (!typewriterRef.current) return;
      try {
        const { from } = editor.state.selection;
        const coords = editor.view.coordsAtPos(from);
        let container: HTMLElement | null = editor.view.dom.parentElement;
        while (container) {
          const style = window.getComputedStyle(container);
          if (/(auto|scroll)/.test(style.overflowY) && container.scrollHeight > container.clientHeight) break;
          container = container.parentElement;
        }
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const delta = coords.top - rect.top - container.clientHeight * 0.4;
        if (Math.abs(delta) > 24) container.scrollTop += delta;
      } catch {
        // 坐标不可用时静默
      }
    };
    editor.on('selectionUpdate', centerCaret);
    editor.on('update', centerCaret);
    return () => {
      editor.off('selectionUpdate', centerCaret);
      editor.off('update', centerCaret);
    };
  }, [editor]);

  useImperativeHandle(
    ref,
    () => ({
      getSelection() {
        if (!editor) return null;
        const { from, to, empty } = editor.state.selection;
        if (empty || from === to) return null;
        const text = editor.state.doc.textBetween(from, to, '\n');
        if (!text.trim()) return null;
        return { text, range: { start: from, end: to } };
      },
      getKeyboardSelectionMenuPosition() {
        if (!editor) return null;
        const { from, to, empty } = editor.state.selection;
        if (empty || from === to) return null;
        const coords = editor.view.coordsAtPos(to);
        return { x: coords.left, y: coords.bottom };
      },
      focus() {
        editor?.commands.focus();
      },
      undo() {
        if (!editor) return false;
        editor.commands.focus();
        return editor.commands.undo();
      },
      redo() {
        if (!editor) return false;
        editor.commands.focus();
        return editor.commands.redo();
      },
      canUndo() {
        if (collaborative) return Boolean(editor);
        return editor?.can().undo() ?? false;
      },
      canRedo() {
        if (collaborative) return Boolean(editor);
        return editor?.can().redo() ?? false;
      },
      harvestDarling() {
        if (!editor) return false;
        return editor.commands.harvestDarling();
      },
      insertGhostOutline(synopsis: string) {
        if (!editor) return false;
        return editor.commands.insertGhostOutline(synopsis);
      },
      setSpellcheck(enabled: boolean) {
        editor?.commands.setSpellcheck(enabled);
      },
      selectRange(from: number, to: number) {
        if (!editor) return false;
        try {
          const { state } = editor;
          const max = state.doc.content.size;
          const a = Math.max(0, Math.min(from, max));
          const b = Math.max(0, Math.min(to, max));
          if (a >= b) return false;
          editor.commands.focus();
          editor.commands.setTextSelection({ from: a, to: b });
          const coords = editor.view.coordsAtPos(b);
          editor.view.dom.ownerDocument?.defaultView?.scrollTo?.({ top: coords.top - 200 });
          return true;
        } catch {
          return false;
        }
      },
      findAll(query: string, caseSensitive: boolean) {
        if (!editor) return [];
        return findMatches(editor.state.doc, query, caseSensitive);
      },
      replaceRange(from: number, to: number, text: string) {
        if (!editor) return false;
        try {
          editor.commands.focus();
          return editor.commands.insertContentAt({ from, to }, text);
        } catch {
          return false;
        }
      },
      insertText(text: string) {
        if (!editor) return false;
        try {
          return editor.commands.insertContent(text);
        } catch {
          return false;
        }
      },
      splitAtCursor() {
        if (!editor) return null;
        try {
          const { state } = editor;
          const pos = state.selection.from;
          const doc = state.doc;
          // 光标在文首/文尾无可拆内容
          if (pos <= 0 || pos >= doc.content.size) return null;
          const before = doc.cut(0, pos);
          const after = doc.cut(pos, doc.content.size);
          return {
            before: pmDocToDsl(before.toJSON() as PmNode),
            after: pmDocToDsl(after.toJSON() as PmNode),
          };
        } catch {
          return null;
        }
      },
    }),
    [editor, collaborative],
  );

  if (!editor) return null;

  return (
    <div
      className={cn(
        'relative h-full w-full min-h-[1200px] rounded-lg border border-border bg-card p-16 font-serif text-lg leading-relaxed text-foreground shadow-sm',
        'selection:bg-primary/15',
        isFocusMode ? 'max-w-3xl text-xl leading-loose' : 'max-w-4xl',
      )}
      style={{ fontFamily: 'var(--font-reading, inherit)', fontSize: 'var(--font-reading-size, 1.125rem)', lineHeight: 'var(--font-reading-lh, 1.9)' }}
      onMouseUp={onMouseUp}
      onKeyUp={onKeyUp}
      onMouseMove={onMouseMove}
    >
      {isEmpty && activeChapterId ? (
        <div className="pointer-events-none absolute inset-0 p-16 text-muted-foreground/50">
          {t('canvas.placeholderReady')}
        </div>
      ) : null}
      <EditorContent
        editor={editor}
        className={cn(
          'novel-canvas min-h-full outline-none',
          !activeChapterId || (isGenerating && !isStreaming) ? 'cursor-not-allowed opacity-60' : 'cursor-text',
        )}
      />
    </div>
  );
});

export default TipTapCanvas;
