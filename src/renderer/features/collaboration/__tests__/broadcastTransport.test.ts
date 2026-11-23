/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { prunePeers, upsertPeer } from '../broadcastTransport';

describe('broadcastTransport', () => {
  it('prunePeers 剔除超时未心跳的对端', () => {
    const peers = [
      { id: 'a', name: 'A', at: 1000 },
      { id: 'b', name: 'B', at: 5000 },
    ];
    expect(prunePeers(peers, 6000, 2000).map((peer) => peer.id)).toEqual(['b']);
  });
});

describe('upsertPeer', () => {
  it('同一 id 重复心跳只留一条，时间戳取最新', () => {
    const first = upsertPeer([], { id: 'a', name: '甲', at: 1000 });
    const second = upsertPeer(first, { id: 'a', name: '甲', at: 5000 });
    expect(second).toEqual([{ id: 'a', name: '甲', at: 5000 }]);
  });

  it('不同 id 各留一条，顺序按加入先后', () => {
    const peers = upsertPeer(upsertPeer([], { id: 'a', name: '甲', at: 1 }), { id: 'b', name: '乙', at: 2 });
    expect(peers.map((peer) => peer.id)).toEqual(['a', 'b']);
  });
});
