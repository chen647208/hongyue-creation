// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectStore } from '@/app/stores/projectStore';
import { useSettingsStore } from '@/app/stores/settingsStore';

import type { Project } from '../../../../shared/types';
import WritingEditor from '../WritingEditor';

/**
 * 画布替身：把命令式句柄交给宿主，并按活动章变化模拟慢设备——
 * 正文渲染就绪远迟于旧的 50ms 固定等待，就绪信号只在延迟后发出。
 */
const RENDER_READY_DELAY_MS = 300;

const canvasStub = vi.hoisted(() => ({
  props: null as null | {
    editorRef: { current: unknown };
    activeChapterId: string | null;
    onOpenSource?: (id: string) => void;
  },
  jumpToBlock: vi.fn(() => true),
  readyListeners: new Set<() => void>(),
}));

vi.mock('../components/WritingEditorCanvas', async () => {
  const React = await import('react');
  const StubCanvas = (props: Record<string, unknown>) => {
    React.useEffect(() => {
      canvasStub.props = props as never;
    });
      const editorRef = props.editorRef as { current: unknown };
      React.useEffect(() => {
        // 句柄只实现跳转相关契约：jumpToBlock 用共享 spy，其余方法为空操作。
        editorRef.current = {
          jumpToBlock: canvasStub.jumpToBlock,
          getSelection: () => null,
          getKeyboardSelectionMenuPosition: () => null,
          focus: () => undefined,
          undo: () => false,
          redo: () => false,
          canUndo: () => false,
          canRedo: () => false,
          harvestDarling: () => false,
          insertGhostOutline: () => false,
          setSpellcheck: () => undefined,
          selectRange: () => false,
          findAll: () => [],
          replaceRange: () => false,
          insertText: () => false,
          getActiveBlockId: () => null,
          getSelectionAnchor: () => null,
          refreshAnnotations: () => undefined,
          insertBlockRef: () => false,
          insertBlockEmbed: () => false,
          refreshEmbeds: () => undefined,
          splitAtCursor: () => null,
          onEditorReady: (listener: () => void) => {
            canvasStub.readyListeners.add(listener);
            return () => {
              canvasStub.readyListeners.delete(listener);
            };
          },
        };
        return () => {
          editorRef.current = null;
        };
      });
      React.useEffect(() => {
        const timer = setTimeout(() => {
          for (const listener of [...canvasStub.readyListeners]) listener();
        }, RENDER_READY_DELAY_MS);
        return () => clearTimeout(timer);
      }, [props.activeChapterId]);
      return null;
  };
  return { default: StubCanvas };
});

// 其余子树与跳转逻辑无关：替换为惰性空实现，保持用例聚焦且不依赖 DOM 细节。
vi.mock('../components/WritingEditorOverlayLayer', () => ({ default: () => null }));
vi.mock('../components/WritingSidebar', () => ({ default: () => null }));
vi.mock('../components/WritingEditorToolbar', () => ({ default: () => null }));
vi.mock('@/shared/ui/Slot', () => ({ Slot: () => null }));
vi.mock('@/shared/ui/FeaturePanel', () => ({ FeaturePanel: () => null }));
vi.mock('@/app/collaboration/collaborationService', () => ({ useChapterCollab: () => null }));
vi.mock('@/shared/services/dialogService', () => ({
  dialogService: { alert: vi.fn(), confirm: vi.fn(async () => true), prompt: vi.fn(async () => '') },
}));

const chapter = (id: string, title: string, order: number, content: string) => ({
  id,
  title,
  order,
  content,
  summary: '',
});

const project: Project = {
  id: 'b1',
  title: '测试书',
  inspiration: '',
  intro: '',
  characters: [],
  outline: '',
  chapters: [
    chapter('c1', '第一章', 0, '^b1\n第一章正文'),
    chapter('c2', '第二章', 1, '^b2\n第二章正文'),
  ],
  virtualChapters: [],
  knowledge: [],
  lastModified: 1,
};

/** 推进真实时间并冲刷 React 更新：慢设备渲染的定时就绪在此期间触发。 */
const settle = (ms = 0) => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, ms));
});

describe('WritingEditor 跨章块跳转', () => {
  beforeEach(() => {
    canvasStub.jumpToBlock.mockClear();
    canvasStub.jumpToBlock.mockReturnValue(true);
    canvasStub.readyListeners.clear();
    useProjectStore.getState().hydrate([project], 'b1');
    useSettingsStore.setState({ theme: undefined, language: undefined });
  });

  it('跨章跳转：等编辑器就绪回调消费待跳请求，渲染远超 50ms 仍能定位', async () => {
    render(<WritingEditor project={project} initialChapterId="c1" onBack={() => undefined} />);
    await settle();

    act(() => {
      canvasStub.props?.onOpenSource?.('b2');
    });
    // 已切章并进入待跳队列，但渲染未就绪前不定位。
    expect(canvasStub.jumpToBlock).not.toHaveBeenCalled();

    // 固定时延（旧实现的 50ms）早已过去，仍不定位：跳转由就绪事件驱动而非定时器。
    await settle(100);
    expect(canvasStub.jumpToBlock).not.toHaveBeenCalled();

    // 渲染就绪（画布发信号）后才定位到目标块。
    await settle(RENDER_READY_DELAY_MS);
    expect(canvasStub.jumpToBlock).toHaveBeenCalledTimes(1);
    expect(canvasStub.jumpToBlock).toHaveBeenCalledWith('b2');
  });

  it('同章跳转：立即定位，不进待跳队列', async () => {
    render(<WritingEditor project={project} initialChapterId="c1" onBack={() => undefined} />);
    await settle();

    act(() => {
      canvasStub.props?.onOpenSource?.('b1');
    });
    expect(canvasStub.jumpToBlock).toHaveBeenCalledWith('b1');

    // 就绪信号不含待跳请求，不会重复定位。
    await settle(RENDER_READY_DELAY_MS + 50);
    expect(canvasStub.jumpToBlock).toHaveBeenCalledTimes(1);
  });

  it('定位失败（正文晚到）时保留待跳，下一次就绪信号重试', async () => {
    canvasStub.jumpToBlock.mockReturnValueOnce(false).mockReturnValue(true);
    render(<WritingEditor project={project} initialChapterId="c1" onBack={() => undefined} />);
    await settle();

    act(() => {
      canvasStub.props?.onOpenSource?.('b2');
    });
    await settle(RENDER_READY_DELAY_MS);
    expect(canvasStub.jumpToBlock).toHaveBeenCalledTimes(1);

    // 画布再次发就绪信号（协作正文经 Y 片段晚到）：补上此前失败的定位。
    act(() => {
      for (const listener of [...canvasStub.readyListeners]) listener();
    });
    expect(canvasStub.jumpToBlock).toHaveBeenCalledTimes(2);
    expect(canvasStub.jumpToBlock).toHaveBeenLastCalledWith('b2');
  });
});
