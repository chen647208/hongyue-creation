/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 传输集成测试：两个副本经真实 BroadcastChannel 交换增量、在线状态与光标。 */
import { describe, it } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { createBroadcastTransport } from '../broadcastTransport';

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('等待条件超时');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('BroadcastChannel 传输', () => {
  it('两个副本收敛正文、在线状态与光标', async () => {
    const room = `test-${crypto.randomUUID()}`;
    const a = new Y.Doc();
    const b = new Y.Doc();
    const awarenessA = new Awareness(a);
    const awarenessB = new Awareness(b);
    awarenessA.setLocalStateField('user', { name: '甲', color: '#e5484d' });

    let peersSeenByB = 0;
    const transportA = createBroadcastTransport(a, room, { awareness: awarenessA });
    const transportB = createBroadcastTransport(b, room, {
      awareness: awarenessB,
      onPresence: (peers) => {
        peersSeenByB = peers.length;
      },
    });

    try {
      a.getText('body').insert(0, '协作正文');
      await waitFor(() => b.getText('body').toString() === '协作正文');

      // 在线状态：双方互相看见
      await waitFor(() => peersSeenByB >= 2);

      // 光标：B 收到 A 的 awareness 状态
      await waitFor(() => awarenessB.getStates().size >= 1);
    } finally {
      transportA.destroy();
      transportB.destroy();
      awarenessA.destroy();
      awarenessB.destroy();
      a.destroy();
      b.destroy();
    }
  });
});
