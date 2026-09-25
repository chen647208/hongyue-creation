/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * DslEditor —— novelDsl 语言的 CodeMirror 6 受控编辑器。
 * 用于大纲 / 卡片正文 / prompt 等「结构化文本」区，替代裸 textarea：
 * 关键字高亮 + @tag 引用波浪线校验。正文创作仍走 TipTap 画布。
 */
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo, useRef } from 'react';

import { dt } from '@/i18n';

import { novelDslExtensions } from './novelDsl';
import { tagValidation } from './tagValidation';

export interface DslEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** 合法标签集（主名 + 别名），驱动波浪线校验与 [[链接]] 补全。 */
  validTags?: Iterable<string>;
  placeholder?: string;
  /** 编辑区可访问名（读屏用）；缺省回落到 placeholder。 */
  ariaLabel?: string;
  /** 是否启用 @tag 校验波浪线（默认 true）。 */
  validate?: boolean;
  /** 是否启用 [[链接]] / @ 自动补全（默认 true）。 */
  complete?: boolean;
  dark?: boolean;
  minHeight?: string;
  maxHeight?: string;
  /** CodeMirror 高度（如 '100%' 撑满 flex 容器，内部滚动）。 */
  height?: string;
  className?: string;
  autoFocus?: boolean;
}

/** 给可聚焦编辑区补可访问名，并让滚动容器进入 Tab 序（axe aria-input-field-name / scrollable-region-focusable）。 */
function accessibleEditor(label: string) {
  return [
    EditorView.contentAttributes.of({ 'aria-label': label }),
    ViewPlugin.fromClass(
      class {
        constructor(view: EditorView) {
          this.apply(view);
        }
        update(update: ViewUpdate): void {
          if (update.docChanged || update.viewportChanged) this.apply(update.view);
        }
        private apply(view: EditorView): void {
          view.scrollDOM.tabIndex = 0;
          view.scrollDOM.setAttribute('aria-label', label);
        }
      },
    ),
  ];
}

/** 补全触发：`[[` 后或 `@` 后，用标签集补全。 */
function makeTagCompletion(getTags: () => string[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/\[\[[^\]]*|@[\p{L}\p{N}_-]*/u);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    const isWiki = word.text.startsWith('[[');
    const typed = isWiki ? word.text.slice(2) : word.text.slice(1);
    const options = getTags()
      .filter((tag) => tag.toLowerCase().includes(typed.toLowerCase()))
      .map((tag) => ({
        label: tag,
        type: isWiki ? 'class' : 'text',
        apply: isWiki ? `[[${tag}]]` : tag,
        detail: isWiki ? dt('steps:detail.wiki') : dt('steps:detail.tag'),
      }));
    if (options.length === 0) return null;
    return { from: word.from, options };
  };
}

export function DslEditor({
  value,
  onChange,
  validTags,
  placeholder,
  ariaLabel,
  validate = true,
  complete = true,
  dark = false,
  minHeight = '12rem',
  maxHeight,
  height,
  className,
  autoFocus,
}: DslEditorProps) {
  const tagsRef = useRef<string[]>([]);
  tagsRef.current = validTags ? Array.from(validTags) : [];

  const editableLabel = ariaLabel ?? placeholder ?? dt('steps:detail.editor');

  const extensions = useMemo(() => {
    const ext = [...novelDslExtensions(), EditorView.lineWrapping, ...accessibleEditor(editableLabel)];
    if (validate) ext.push(tagValidation(() => new Set(tagsRef.current)));
    if (complete) {
      ext.push(
        autocompletion({
          override: [makeTagCompletion(() => tagsRef.current)],
          icons: false,
        }),
      );
    }
    return ext;
  }, [validate, complete, editableLabel]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={dark ? 'dark' : 'light'}
      placeholder={placeholder}
      height={height}
      className={className ?? 'novel-dsl-editor'}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false, // 由我们的 override 接管
      }}
      style={{ minHeight, maxHeight, overflowY: maxHeight ? 'auto' : undefined }}
      autoFocus={autoFocus}
    />
  );
}
