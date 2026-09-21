/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 查找替换（编辑器内）：状态 + 快捷键 + 匹配跳转/替换。
 * 匹配经 editor doc 实时计算，当前匹配即选区（选区即高亮）。
 */
import { type RefObject,useCallback, useEffect, useState } from 'react';

import { matchEvent, useResolvedKeybindings } from '@/shared/keymap';

import type { NovelEditorHandle } from '../types';

interface UseFindReplaceOptions {
  editorRef: RefObject<NovelEditorHandle | null>;
  activeChapterId: string | null;
  /** 正文内容：变化时重算匹配（随章节切换/编辑刷新）。 */
  content: string;
  /** 弹窗/侧栏打开时暂停快捷键（不抢键）。 */
  shortcutBlocked: boolean;
}

export function useFindReplace({ editorRef, activeChapterId, content, shortcutBlocked }: UseFindReplaceOptions) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);

  const matchesNow = useCallback((): Array<{ from: number; to: number }> => {
    if (!query.trim()) return [];
    return editorRef.current?.findAll(query, caseSensitive) ?? [];
    // content 仅作重算触发，闭包内不直接读
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, activeChapterId, content, editorRef]);

  const jump = useCallback((delta: number) => {
    const matches = matchesNow();
    if (matches.length === 0) return;
    const next = (matchIndex + delta + matches.length) % matches.length;
    setMatchIndex(next);
    const m = matches[next];
    if (m) editorRef.current?.selectRange(m.from, m.to);
  }, [matchesNow, matchIndex, editorRef]);

  const replaceOne = useCallback(() => {
    const matches = matchesNow();
    const m = matches[Math.min(matchIndex, Math.max(0, matches.length - 1))];
    if (!m) return;
    editorRef.current?.replaceRange(m.from, m.to, replacement);
  }, [matchesNow, matchIndex, replacement, editorRef]);

  const replaceAll = useCallback(() => {
    // 从后往前替换，坐标不漂移
    const matches = matchesNow();
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      if (m) editorRef.current?.replaceRange(m.from, m.to, replacement);
    }
    setMatchIndex(0);
  }, [matchesNow, replacement, editorRef]);

  // 查找条开关：默认 Ctrl/Cmd+F（编辑器内有效，设置页可改键）
  const findBinding = useResolvedKeybindings().find;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (matchEvent(findBinding, e) && activeChapterId && !shortcutBlocked) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [findBinding, activeChapterId, shortcutBlocked]);

  // 查询变化回到首个匹配
  useEffect(() => {
    if (!open) return;
    setMatchIndex(0);
    const matches = editorRef.current?.findAll(query, caseSensitive) ?? [];
    const m = matches[0];
    if (m && query.trim()) editorRef.current?.selectRange(m.from, m.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, caseSensitive, activeChapterId]);

  return {
    open,
    setOpen,
    query,
    setQuery,
    replacement,
    setReplacement,
    caseSensitive,
    toggleCaseSensitive: () => setCaseSensitive((v) => !v),
    matchIndex,
    matchCount: matchesNow().length,
    prev: () => jump(-1),
    next: () => jump(1),
    replaceOne,
    replaceAll,
  };
}
