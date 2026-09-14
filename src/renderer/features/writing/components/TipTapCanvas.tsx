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
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorContent, useEditor } from '@tiptap/react';
import React, { forwardRef, useCallback,useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/utils/cn';

import type { AnnotationAnchor } from '../../../../shared/types';
import {
  type AnnotationDecorationInput,
  blockPlainText,
  docPosToPlainOffset,
} from '../../../editor/annotationDecorations';
import { refreshBlockEmbedViews } from '../../../editor/blockEmbedNodeView';
import { BLOCK_ID_ATTRIBUTE } from '../../../editor/blockIndex';
import type { ResolvedBlockProjection } from '../../../editor/blockRefs';
import { createCollaborativeExtensions } from '../../../editor/collaborative';
import { findMatches } from '../../../editor/findReplace';
import { createWritingPrimitives } from '../../../editor/primitives';
import { createNovelExtensions } from '../../../editor/schema';
import { createScreenplayFormatting } from '../../../editor/screenplay';
import { dslToPmDoc, pmDocToDsl, type PmNode } from '../../../editor/serialization';
import { paperInlineStyle } from '../services/writingToolsService';
import type { EditorCollaboration, NovelEditorHandle, PaperStyle } from '../types';

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
  /** 纸张样式（背景/网格线）。 */
  paper?: PaperStyle;
  /** 打字机模式：光标保持在视口中部跟随滚动。 */
  typewriter?: boolean;
  /** Enter×3 连按：宿主创建新章并切换（不阻塞继续输入）。 */
  onNewChapter?: () => void;
  /** 块嵌入投影解析（缺省一律失链）。 */
  resolveBlock?: (id: string) => ResolvedBlockProjection | null;
  /** 点击嵌入/失链块跳转源块。 */
  onOpenSource?: (id: string) => void;
  /** 光标所在块变化时回调（反向引用面板用）。 */
  onActiveBlockChange?: (id: string | null) => void;
  /** 行内批注装饰范围（未解决且已锚定；变化时重算装饰）。 */
  annotations?: readonly AnnotationDecorationInput[];
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
  { content, activeChapterId, locked, collaboration, screenplayFormat, paper, isFocusMode, isGenerating, isStreaming, typewriter, onNewChapter, resolveBlock, onOpenSource, onActiveBlockChange, annotations, onContentChange, onMouseUp, onKeyUp, onMouseMove },
  ref,
) {
  const { t } = useTranslation('writing');
  const collaborative = Boolean(collaboration);
  // 回调经 ref 传递，避免每次渲染重建编辑器实例。
  const onChangeRef = useRef(onContentChange);
  onChangeRef.current = onContentChange;
  const onNewChapterRef = useRef(onNewChapter);
  onNewChapterRef.current = onNewChapter;
  const onActiveBlockChangeRef = useRef(onActiveBlockChange);
  onActiveBlockChangeRef.current = onActiveBlockChange;
  const resolveBlockRef = useRef(resolveBlock);
  resolveBlockRef.current = resolveBlock;
  const onOpenSourceRef = useRef(onOpenSource);
  onOpenSourceRef.current = onOpenSource;
  const annotationsRef = useRef<readonly AnnotationDecorationInput[]>(annotations ?? []);
  annotationsRef.current = annotations ?? [];
  // 稳定的扩展选项身份：项目数据变化经 ref 读取，不触发编辑器重建。
  const stableResolveBlock = useCallback((id: string) => resolveBlockRef.current?.(id) ?? null, []);
  const stableOnOpenSource = useCallback((id: string) => { onOpenSourceRef.current?.(id); }, []);
  const stableGetAnnotations = useCallback(() => annotationsRef.current, []);
  // 记录最近一次由本编辑器吐出的 DSL，用于区分「外部受控更新」与「自身回环」。
  const lastEmitted = useRef<string>(content);
  const [isEmpty, setIsEmpty] = useState(() => content.trim().length === 0);

  // schema 节点 + 8 写作原语（enterFlow 的新章回调经 ref 转发，保持扩展集稳定不重建）。
  // 协作模式另加 y-prosemirror 同步/光标/撤销插件，并关闭 StarterKit 的 History。
  const fragment = collaboration?.fragment;
  const awareness = collaboration?.awareness;
  const extensions = useMemo(
    () => [
      ...(collaborative
        ? createCollaborativeExtensions({ resolveBlock: stableResolveBlock, onOpenSource: stableOnOpenSource, getAnnotations: stableGetAnnotations })
        : createNovelExtensions({ resolveBlock: stableResolveBlock, onOpenSource: stableOnOpenSource, getAnnotations: stableGetAnnotations })),
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
    [collaborative, fragment, awareness, screenplayFormat, stableResolveBlock, stableOnOpenSource, stableGetAnnotations],
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
      onSelectionUpdate: ({ editor: e }) => {
        const { from } = e.state.selection;
        const $pos = e.state.doc.resolve(from);
        let active: string | null = null;
        for (let depth = $pos.depth; depth > 0; depth--) {
          const id = $pos.node(depth).attrs?.[BLOCK_ID_ATTRIBUTE];
          if (typeof id === 'string' && id.length > 0) { active = id; break; }
        }
        onActiveBlockChangeRef.current?.(active);
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

  // 批注数据变化（新增/解决/失锚）不产生文档事务：派发空事务触发装饰重算。
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr);
  }, [editor, annotations]);

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
      getActiveBlockId() {
        if (!editor) return null;
        const { from } = editor.state.selection;
        const $pos = editor.state.doc.resolve(from);
        for (let depth = $pos.depth; depth > 0; depth--) {
          const id = $pos.node(depth).attrs?.[BLOCK_ID_ATTRIBUTE];
          if (typeof id === 'string' && id.length > 0) return id;
        }
        return null;
      },
      getSelectionAnchor() {
        if (!editor) return null;
        const { from, to, empty } = editor.state.selection;
        if (empty || from === to) return null;
        const doc = editor.state.doc;
        const $from = doc.resolve(from);
        let blockNode: ProseMirrorNode | null = null;
        let blockPos = -1;
        let blockId: string | null = null;
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          const id = node.attrs?.[BLOCK_ID_ATTRIBUTE];
          if (typeof id === 'string' && id.length > 0) {
            blockNode = node;
            blockPos = $from.before(depth);
            blockId = id;
            break;
          }
        }
        if (!blockNode || blockId === null) return null;
        const text = blockPlainText(blockNode);
        const blockEnd = blockPos + blockNode.nodeSize - 1;
        const endPos = Math.min(to, blockEnd);
        const start = docPosToPlainOffset(blockNode, blockPos, from);
        const end = Math.max(start, Math.min(docPosToPlainOffset(blockNode, blockPos, endPos), text.length));
        const quote = text.slice(start, end);
        if (!quote) return null;
        const anchor: AnnotationAnchor = { blockId, start, end, quote };
        return anchor;
      },
      refreshAnnotations() {
        if (editor) editor.view.dispatch(editor.state.tr);
      },
      insertBlockRef(id: string) {
        if (!editor) return false;
        try {
          return editor.commands.insertContent({ type: 'blockRef', attrs: { id } });
        } catch {
          return false;
        }
      },
      insertBlockEmbed(id: string) {
        if (!editor) return false;
        try {
          return editor.chain().focus().insertContent({ type: 'blockEmbed', attrs: { id } }).run();
        } catch {
          return false;
        }
      },
      jumpToBlock(id: string) {
        if (!editor) return false;
        let pos = -1;
        editor.state.doc.descendants((node, nodePos) => {
          if (pos >= 0) return false;
          const value = node.attrs?.[BLOCK_ID_ATTRIBUTE];
          if (typeof value === 'string' && value === id) {
            pos = nodePos;
            return false;
          }
          return true;
        });
        if (pos < 0) return false;
        try {
          editor.commands.focus();
          editor.commands.setTextSelection(pos + 1);
          const coords = editor.view.coordsAtPos(pos + 1);
          editor.view.dom.ownerDocument?.defaultView?.scrollTo?.({ top: Math.max(0, coords.top - 200), behavior: 'smooth' });
          return true;
        } catch {
          return false;
        }
      },
      refreshEmbeds() {
        refreshBlockEmbedViews();
        // 空事务触发装饰重算，让行内引用的失链标记随项目数据刷新。
        if (editor) editor.view.dispatch(editor.state.tr);
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
        'relative h-full w-full min-h-[1200px] min-w-[320px] rounded-lg border border-border bg-card p-16 font-serif text-lg leading-relaxed text-foreground shadow-sm',
        'selection:bg-primary/15',
        isFocusMode ? 'max-w-3xl text-xl leading-loose' : 'max-w-4xl',
      )}
      style={{ ...paperInlineStyle(paper ?? 'plain'), fontFamily: 'var(--font-reading, inherit)', fontSize: 'var(--font-reading-size, 1.125rem)', lineHeight: 'var(--font-reading-lh, 1.9)' }}
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
          'novel-canvas w-full min-h-full outline-none',
          !activeChapterId || (isGenerating && !isStreaming) ? 'cursor-not-allowed opacity-60' : 'cursor-text',
        )}
      />
    </div>
  );
});

export default TipTapCanvas;
