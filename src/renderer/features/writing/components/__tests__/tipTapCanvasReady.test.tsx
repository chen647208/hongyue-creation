// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import type { NovelEditorHandle } from '../../types';
import TipTapCanvas from '../TipTapCanvas';

/** 画布必填 props 的固定部分：用例只改活动章与正文。 */
const FIXED_PROPS = {
  isFocusMode: false,
  isGenerating: false,
  isStreaming: false,
  onContentChange: () => undefined,
  onMouseUp: () => undefined,
  onKeyUp: () => undefined,
  onMouseMove: () => undefined,
  onStopStreaming: () => undefined,
  onStopBatchGeneration: () => undefined,
  streamingTokens: { prompt: 0, completion: 0, total: 0 },
  traditionalTokens: { prompt: 0, completion: 0, total: 0 },
  stoppedPartialLength: 0,
  onKeepStoppedPartial: () => undefined,
  onDiscardStoppedPartial: () => undefined,
} as const;

function renderCanvas(activeChapterId: string | null, content: string) {
  const ref = createRef<NovelEditorHandle>();
  const utils = render(<TipTapCanvas ref={ref} {...FIXED_PROPS} activeChapterId={activeChapterId} content={content} />);
  return {
    ref,
    /** 重渲染改章/改正文：模拟宿主切章或受控内容更新。 */
    rerender: (nextChapterId: string | null, nextContent: string) =>
      utils.rerender(<TipTapCanvas ref={ref} {...FIXED_PROPS} activeChapterId={nextChapterId} content={nextContent} />),
    unmount: utils.unmount,
  };
}

describe('TipTapCanvas 就绪信号', () => {
  it('切章后信号在新章正文进入文档之后发出', () => {
    const canvas = renderCanvas('c1', '第一章正文');
    // 挂载时的就绪信号无订阅者；之后订阅，模拟宿主在编辑器存在后才挂待跳队列。
    const docHadTargetAtSignal: boolean[] = [];
    const unsubscribe = canvas.ref.current?.onEditorReady(() => {
      // 信号到达时文档必须已含新章正文，宿主才能直接定位块。
      docHadTargetAtSignal.push((canvas.ref.current?.findAll('第二章', false).length ?? 0) > 0);
    });

    // 同章重复渲染（本地输入）不重复发信号。
    canvas.rerender('c1', '第一章正文（改动）');
    expect(docHadTargetAtSignal).toEqual([]);

    // 切章：信号晚于 setContent 发出，此刻文档已切换。
    canvas.rerender('c2', '^b2\n第二章正文');
    expect(docHadTargetAtSignal).toEqual([true]);

    unsubscribe?.();
    canvas.unmount();
  });

  it('目标章正文为空的切章也发信号（不靠固定时延等待）', () => {
    const canvas = renderCanvas('c1', '第一章正文');
    const signals: number[] = [];
    canvas.ref.current?.onEditorReady(() => signals.push(1));
    canvas.rerender('c2', '');
    expect(signals).toEqual([1]);
    canvas.unmount();
  });
});
