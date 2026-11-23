/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({ i18n: { t: (key: string, opts?: { id?: string }) => `${key}:${opts?.id ?? ''}` } }));

import { createLocalIdentity, guestPeerName, PEER_COLORS, peerColorFor } from '@/shared/utils/peerIdentity';

/** 光标插件用 /^#[0-9a-fA-F]{6}$/ 校验颜色，不合规会回退成透明。 */
const CARET_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

describe('peerColorFor', () => {
  it('调色板里每个颜色都满足光标插件的校验格式', () => {
    for (const color of PEER_COLORS) expect(color).toMatch(CARET_COLOR_PATTERN);
  });

  it('同一客户端编号稳定取同一颜色，编号按池长循环', () => {
    expect(peerColorFor(3)).toBe(PEER_COLORS[3]);
    expect(peerColorFor(3 + PEER_COLORS.length)).toBe(PEER_COLORS[3]);
  });

  it('负编号取绝对值后取色，不越界', () => {
    expect(peerColorFor(-1)).toBe(PEER_COLORS[1]);
  });
});

describe('createLocalIdentity', () => {
  it('给出非空名字与合规颜色', () => {
    const identity = createLocalIdentity(7);
    expect(identity.name).not.toBe('');
    expect(identity.color).toMatch(CARET_COLOR_PATTERN);
    expect(identity.color).toBe(peerColorFor(7));
  });
});

describe('guestPeerName', () => {
  it('走字典插值，不拼接中文前缀', () => {
    expect(guestPeerName('3f2a')).toBe('settings:collab.guestName:3f2a');
  });
});
