// @vitest-environment jsdom
/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Chapter, RevisionReviewState } from '../../../../../shared/types';
import ChapterHistoryModal from '../ChapterHistoryModal';

const { loadRevisions } = vi.hoisted(() => ({ loadRevisions: vi.fn() }));

// 修订记录按需经 repository 读取，测试注入固定数据
vi.mock('@/shared/services/repository', () => ({
  repository: {
    loadRevisions: (...args: unknown[]) => loadRevisions(...args),
  },
}));

const BASELINE = '旧文';
const CURRENT = '他慢慢地走进屋子，四下张望。';

function makeChapter(revisionReview?: RevisionReviewState): Chapter {
  return {
    id: 'ch_1',
    title: '第一章',
    summary: '',
    content: CURRENT,
    order: 0,
    snapshots: [{ id: 'snap_1', content: BASELINE, timestamp: 1, charCount: 2, source: 'manual' }],
    ...(revisionReview ? { revisionReview } : {}),
  };
}

function renderModal(chapter: Chapter) {
  const onUpdateChapter = vi.fn();
  const utils = render(
    <ChapterHistoryModal
      isOpen
      chapter={chapter}
      onClose={() => undefined}
      onApplyContent={() => undefined}
      onClearHistory={() => undefined}
      onUpdateChapter={onUpdateChapter}
    />,
  );
  return { onUpdateChapter, ...utils };
}

/** 迁移写回调用里的侧车字段（第一次 onUpdateChapter 调用）。 */
function writtenReview(onUpdateChapter: ReturnType<typeof vi.fn>): RevisionReviewState | undefined {
  const first = onUpdateChapter.mock.calls[0]?.[0] as Chapter | undefined;
  return first?.revisionReview;
}

beforeEach(() => {
  loadRevisions.mockReset();
  loadRevisions.mockResolvedValue([]);
  // jsdom 未实现 scrollIntoView，逐处导航滚入视野会调用
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe('ChapterHistoryModal 修订对比恢复与读时迁移', () => {
  it('历史格式（只有全文）打开即迁移为快照 id 引用，并恢复续审', async () => {
    const chapter = makeChapter({ label: '快照 12:00', baseline: BASELINE, decisions: { h0: 'accept' } });
    const { onUpdateChapter } = renderModal(chapter);

    // 续审恢复：标题带上基线标签
    expect(await screen.findByText('修订对比：快照 12:00 → 当前正文')).toBeTruthy();
    // 迁移写回：引用快照 id，丢掉全文副本，逐处决定保留
    await waitFor(() => expect(onUpdateChapter).toHaveBeenCalledTimes(1));
    expect(writtenReview(onUpdateChapter)).toEqual({
      label: '快照 12:00',
      baselineRef: { source: 'snapshot', id: 'snap_1' },
      decisions: { h0: 'accept' },
    });
  });

  it('历史格式匹配修订 id 后迁移为修订引用', async () => {
    loadRevisions.mockResolvedValue([
      { id: 'rev_1', nodeId: 'ch_1', seq: 1, body: BASELINE, author: 'user', createdAt: 1 },
      { id: 'rev_2', nodeId: 'ch_1', seq: 2, body: '另一版', author: 'user', createdAt: 2 },
    ]);
    // 基线正文不与任何快照相同，只匹配修订记录
    const chapter = makeChapter({ label: '#1', baseline: BASELINE, decisions: {} });
    chapter.snapshots = [];
    const { onUpdateChapter } = renderModal(chapter);

    await waitFor(() => expect(onUpdateChapter).toHaveBeenCalledTimes(1));
    expect(loadRevisions).toHaveBeenCalledWith('ch_1');
    expect(writtenReview(onUpdateChapter)).toEqual({
      label: '#1',
      baselineRef: { source: 'revision', id: 'rev_1' },
      decisions: {},
    });
    expect(await screen.findByText('修订对比：#1 → 当前正文')).toBeTruthy();
  });

  it('历史格式匹配不到 id 时保留全文兜底，不回写', async () => {
    const chapter = makeChapter({ label: '#9', baseline: '手改过的基线', decisions: { h0: 'reject' } });
    const { onUpdateChapter } = renderModal(chapter);

    expect(await screen.findByText('修订对比：#9 → 当前正文')).toBeTruthy();
    // 等一轮异步修订匹配结束，确认没有回写
    await waitFor(() => expect(loadRevisions).toHaveBeenCalledWith('ch_1'));
    expect(onUpdateChapter).not.toHaveBeenCalled();
  });

  it('新格式快照引用直接恢复，不触发回写', async () => {
    const chapter = makeChapter({ label: '快照 12:00', baselineRef: { source: 'snapshot', id: 'snap_1' }, decisions: { h0: 'reject' } });
    const { onUpdateChapter } = renderModal(chapter);

    expect(await screen.findByText('修订对比：快照 12:00 → 当前正文')).toBeTruthy();
    await waitFor(() => expect(loadRevisions).not.toHaveBeenCalled());
    expect(onUpdateChapter).not.toHaveBeenCalled();
  });

  it('新格式修订引用异步载入正文后恢复，引用失效回落全文', async () => {
    loadRevisions.mockResolvedValue([
      { id: 'rev_9', nodeId: 'ch_1', seq: 3, body: BASELINE, author: 'user', createdAt: 3 },
    ]);
    const chapter = makeChapter({ label: '#3', baselineRef: { source: 'revision', id: 'rev_9' }, decisions: {} });
    const { onUpdateChapter } = renderModal(chapter);

    expect(await screen.findByText('修订对比：#3 → 当前正文')).toBeTruthy();
    // 逐处接受：决定仍按引用写回，不带正文副本
    const acceptButtons = await screen.findAllByRole('button', { name: '接受（采用该版本）' });
    acceptButtons[0]?.click();
    await waitFor(() => expect(onUpdateChapter).toHaveBeenCalledTimes(1));
    expect(writtenReview(onUpdateChapter)).toEqual({
      label: '#3',
      baselineRef: { source: 'revision', id: 'rev_9' },
      decisions: { h0: 'accept' },
    });
  });

  it('引用失效且有兜底全文时恢复全文对比', async () => {
    const chapter = makeChapter({
      label: '快照 12:00',
      baselineRef: { source: 'snapshot', id: 'snap_deleted' },
      baseline: BASELINE,
      decisions: {},
    });
    const { onUpdateChapter } = renderModal(chapter);

    expect(await screen.findByText('修订对比：快照 12:00 → 当前正文')).toBeTruthy();
    expect(onUpdateChapter).not.toHaveBeenCalled();
  });
});
