// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Chapter, Project } from '../../../../shared/types';
import { composeAppState, flushNow, getLastPersistedSnapshot, seedPersistBaseline } from '../persistenceBridge';
import { useProjectStore } from '../projectStore';
import { useSettingsStore } from '../settingsStore';

interface SaveEvent {
  bookId: string;
  chapterId: string;
  title: string;
}

const pluginEvents = vi.hoisted(() => ({
  emitted: [] as SaveEvent[],
  /** 是否有脚本订阅 chapter.save：false 时桥不派发也不计算变化集。 */
  subscribed: false,
}));

vi.mock('@/shared/services/pluginEventBus', () => ({
  bindPluginEventHost: vi.fn(),
  hasPluginScriptSubscribers: (event: string) => event === 'chapter.save' && pluginEvents.subscribed,
  emitPluginEvent: (event: string, payload: unknown) => {
    if (event === 'chapter.save') pluginEvents.emitted.push(payload as SaveEvent);
  },
}));

// setTheme 动作内即时生效会触碰 document；无头环境 mock 掉主题应用
vi.mock('../../../shared/services/themeService', () => ({
  applyTheme: vi.fn(),
  watchSystemTheme: vi.fn(() => () => undefined),
}));

const chapter = (id: string, title: string, content: string): Chapter => ({ id, title, content, summary: '', order: 0 });

const book = (chapters: Chapter[]): Project => ({
  id: 'b1',
  title: '测试书',
  inspiration: '',
  intro: '',
  characters: [],
  outline: '',
  chapters,
  virtualChapters: [],
  knowledge: [],
  lastModified: 1,
});

describe('persistenceBridge 的 chapter.save 派发', () => {
  beforeEach(() => {
    pluginEvents.emitted.length = 0;
    pluginEvents.subscribed = true;
    useProjectStore.getState().hydrate([], null);
    // 复位外观偏好，避免跨用例的设置差分干扰
    useSettingsStore.setState({ theme: undefined, language: undefined });
  });

  afterEach(() => {
    pluginEvents.subscribed = false;
    seedPersistBaseline(null);
  });

  it('首帧全量落盘（基线不存在）：逐章派发 chapter.save', async () => {
    useProjectStore.getState().hydrate(
      [book([chapter('c1', '第一章', '正文一'), chapter('c2', '第二章', '正文二')])],
      'b1',
    );
    seedPersistBaseline(null);

    await flushNow();

    expect(pluginEvents.emitted).toEqual([
      { bookId: 'b1', chapterId: 'c1', title: '第一章' },
      { bookId: 'b1', chapterId: 'c2', title: '第二章' },
    ]);
  });

  it('章节重建引用但内容相同（hydrate 重新载入）：不重复派发', async () => {
    useProjectStore.getState().hydrate([book([chapter('c1', '第一章', '正文一')])], 'b1');
    const baseline = composeAppState();
    seedPersistBaseline(baseline);

    // 同一内容重新载入：书与章节对象全部换新引用，深相等
    useProjectStore.getState().hydrate([book([chapter('c1', '第一章', '正文一')])], 'b1');
    await flushNow();

    expect(pluginEvents.emitted).toEqual([]);
    // 落盘确实发生过：哨兵快照已推进到重载后的新引用
    expect(getLastPersistedSnapshot()).not.toBeNull();
    expect(getLastPersistedSnapshot()?.projects[0]).not.toBe(baseline.projects[0]);
  });

  it('章节内容变化：只派发变化的章节', async () => {
    useProjectStore.getState().hydrate(
      [book([chapter('c1', '第一章', '正文一'), chapter('c2', '第二章', '正文二')])],
      'b1',
    );
    seedPersistBaseline(composeAppState());

    // c1 改正文，c2 原样重建引用
    useProjectStore.getState().hydrate(
      [book([chapter('c1', '第一章', '正文一（改）'), chapter('c2', '第二章', '正文二')])],
      'b1',
    );
    await flushNow();

    expect(pluginEvents.emitted).toEqual([{ bookId: 'b1', chapterId: 'c1', title: '第一章' }]);
  });
});
