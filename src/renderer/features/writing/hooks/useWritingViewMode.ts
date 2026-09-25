/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 编辑器视觉态（专注模式 / 打字机模式 / 纸张样式 / 剧本格式）的状态与写回。 */
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import { useCallback, useEffect, useState } from 'react';

import { localStore } from '@/shared/services/localStore';

import { isScreenplayFormatEnabled, readPaperStyle, setScreenplayFormatEnabled, writePaperStyle } from '../services/writingToolsService';
import type { PaperStyle } from '../types';

export interface WritingViewMode {
  /** 打字机模式：输入行保持视口居中；开关随写随存。 */
  typewriter: boolean;
  toggleTypewriter: () => void;
  /** 专注模式：隐藏侧栏，按 Esc 退出。 */
  isFocusMode: boolean;
  setFocusMode: (value: boolean | ((previous: boolean) => boolean)) => void;
  /** 纸张样式：写入即持久化。 */
  paper: PaperStyle;
  setPaper: (style: PaperStyle) => void;
  /** 剧本格式：写入即持久化。 */
  screenplayFormat: boolean;
  setScreenplayFormat: (value: boolean) => void;
}

/** 写作编辑器的视觉态：开关在会话间持久化，专注模式的 Esc 退出也在此接管。 */
export function useWritingViewMode(): WritingViewMode {
  const [typewriter, setTypewriter] = useState<boolean>(() => {
    try {
      return localStore.getItem(STORAGE_KEYS.editorTypewriter) === '1';
    } catch {
      return false;
    }
  });
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [screenplayFormat, setScreenplayFormatState] = useState(() => isScreenplayFormatEnabled());
  const [paper, setPaperState] = useState(() => readPaperStyle());

  const toggleTypewriter = useCallback(() => {
    setTypewriter((v) => {
      try {
        localStore.setItem(STORAGE_KEYS.editorTypewriter, v ? '0' : '1');
      } catch {
        // 存储不可用时仅本会话生效
      }
      return !v;
    });
  }, []);

  // 专注模式下 Esc 退出
  useEffect(() => {
    if (!isFocusMode) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFocusMode(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFocusMode]);

  const setPaper = useCallback((style: PaperStyle) => {
    writePaperStyle(style);
    setPaperState(style);
  }, []);

  const setScreenplayFormat = useCallback((value: boolean) => {
    setScreenplayFormatEnabled(value);
    setScreenplayFormatState(value);
  }, []);

  return {
    typewriter,
    toggleTypewriter,
    isFocusMode,
    setFocusMode: setIsFocusMode,
    paper,
    setPaper,
    screenplayFormat,
    setScreenplayFormat,
  };
}
