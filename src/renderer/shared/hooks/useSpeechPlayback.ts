/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 朗读入口共用 hook：接收调用方给的合成配置，统一起停与进度状态。 */
import type { TtsConfig } from '@shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isTtsAvailable, startSpeech, stopSpeech } from '../services/ttsService';

export interface SpeechPlaybackState {
  /** 当前环境/配置是否可朗读（不可用时入口隐藏）。 */
  supported: boolean;
  speaking: boolean;
  /** 正在播第 index 段，共 total 段；未播放为 null。 */
  progress: { index: number; total: number } | null;
  start: (text: string) => void;
  stop: () => void;
  toggle: (text: string) => void;
}

export function useSpeechPlayback(tts: TtsConfig): SpeechPlaybackState {
  const [speaking, setSpeaking] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const supported = isTtsAvailable(tts);

  // 组件卸载时停止本组件发起的朗读，避免离开面板后还在念
  const ownedRef = useRef(false);
  useEffect(() => () => {
    if (ownedRef.current) stopSpeech();
  }, []);

  const stop = useCallback(() => {
    ownedRef.current = false;
    stopSpeech();
    setSpeaking(false);
    setProgress(null);
  }, []);

  const start = useCallback((text: string) => {
    stop();
    const playback = startSpeech(text, tts, {
      onProgress: (index, total) => setProgress({ index, total }),
      onEnd: () => {
        setSpeaking(false);
        setProgress(null);
      },
    });
    if (!playback) return;
    ownedRef.current = true;
    setSpeaking(true);
  }, [stop, tts]);

  const toggle = useCallback((text: string) => {
    if (speaking) stop();
    else start(text);
  }, [speaking, start, stop]);

  return { supported, speaking, progress, start, stop, toggle };
}
