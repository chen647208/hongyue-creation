/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 协作会话状态机：sessionState 随会话建立/握手/停止流转（51 篇外显给协作面板）。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '../../../../shared/types';
import { useProjectStore } from '../../stores/projectStore';
import { startCollaboration, stopCollaboration, useCollaborationStore } from '../collaborationService';

// BroadcastChannel 在 node 环境缺失：transport 回落 no-op，恰好隔离掉真实通信
const book = (id: string, title = id): Project => ({
  id, title, inspiration: '', intro: '', characters: [], outline: '',
  chapters: [], virtualChapters: [], knowledge: [], lastModified: 1,
});

describe('collaborationService sessionState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const project = book('p1', '测试书');
    useProjectStore.getState().hydrate([project], 'p1');
    useCollaborationStore.setState({ enabled: true, peers: [], sessionProjectId: null, sessionState: 'off' });
  });

  afterEach(() => {
    vi.useRealTimers();
    stopCollaboration();
  });

  it('startCollaboration 后进入 handshaking，SEED_GRACE 过后变 ready', () => {
    startCollaboration('p1');
    expect(useCollaborationStore.getState().sessionState).toBe('handshaking');
    expect(useCollaborationStore.getState().sessionProjectId).toBe('p1');

    vi.advanceTimersByTime(500);
    expect(useCollaborationStore.getState().sessionState).toBe('ready');
  });

  it('stopCollaboration 回到 off', () => {
    startCollaboration('p1');
    vi.advanceTimersByTime(500);
    stopCollaboration();
    expect(useCollaborationStore.getState().sessionState).toBe('off');
    expect(useCollaborationStore.getState().sessionProjectId).toBeNull();
  });

  it('同书重复 startCollaboration 不重启会话（保持 ready）', () => {
    startCollaboration('p1');
    vi.advanceTimersByTime(500);
    expect(useCollaborationStore.getState().sessionState).toBe('ready');
    startCollaboration('p1');
    vi.advanceTimersByTime(500);
    expect(useCollaborationStore.getState().sessionState).toBe('ready');
  });

  it('书不存在时不建立会话（保持 off）', () => {
    startCollaboration('不存在');
    expect(useCollaborationStore.getState().sessionState).toBe('off');
  });
});
