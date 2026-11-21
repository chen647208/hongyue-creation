// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { act, render, screen } from '@testing-library/react';
import { createRef, useEffect, useRef, useState } from 'react';
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
    const docHadTargetAtSignal: boolean[] = [];
    const unsubscribe = canvas.ref.current?.onEditorReady(() => {
      // 信号到达时文档必须已含新章正文，宿主才能直接定位块。
      docHadTargetAtSignal.push((canvas.ref.current?.findAll('第二章', false).length ?? 0) > 0);
    });

    // 订阅时当前章（c1）已就绪：补发一次，此刻文档尚无第二章。
    expect(docHadTargetAtSignal).toEqual([false]);
    docHadTargetAtSignal.length = 0;

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
    // 订阅补发一次当前章信号。
    expect(signals).toEqual([1]);
    signals.length = 0;

    canvas.rerender('c2', '');
    expect(signals).toEqual([1]);
    canvas.unmount();
  });

  it('宿主按切章重订订阅时，切章信号不会因先发后订而丢失', () => {
    const signals: number[] = [];
    function Host() {
      const ref = useRef<NovelEditorHandle>(null);
      const [chapter, setChapter] = useState('c1');
      // 复刻 WritingEditor：订阅依赖活动章，切章时先退订再重订。
      useEffect(() => {
        const handle = ref.current;
        return handle?.onEditorReady(() => signals.push(1));
      }, [chapter]);
      return (
        <>
          <button onClick={() => setChapter('c2')}>切章</button>
          <TipTapCanvas
            ref={ref}
            {...FIXED_PROPS}
            activeChapterId={chapter}
            content={chapter === 'c1' ? '第一章正文' : '^b2\n第二章正文'}
          />
        </>
      );
    }

    render(<Host />);
    // 只关心切章那一次：挂载订阅的补发信号先清掉。
    signals.length = 0;

    act(() => {
      screen.getByText('切章').click();
    });
    // 子组件的就绪通知可能早于重订：新订阅补发当前章信号，正好驱动待跳队列。
    expect(signals).toEqual([1]);
  });
});
