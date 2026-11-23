/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 跨设备传输：消息经主进程 WebSocket 中转；协议与同机传输一致（增量 + 在线状态）。 */
import { applyAwarenessUpdate, type Awareness,encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { guestPeerName } from '@/shared/utils/peerIdentity';

import { type CollaborationPeer, type CollaborationTransport,prunePeers, upsertPeer } from './broadcastTransport';

const HEARTBEAT_MS = 4000;
const PEER_TTL_MS = 12000;

interface WireMessage {
  room?: string;
  type?: 'update' | 'sync-request' | 'presence' | 'awareness';
  update?: number[];
  awareness?: number[];
  peer?: CollaborationPeer;
}

export interface IpcTransportOptions {
  url: string;
  name?: string;
  awareness?: Awareness;
  onPresence?: (peers: CollaborationPeer[]) => void;
  onRemoteUpdate?: () => void;
}

export function createIpcTransport(doc: Y.Doc, room: string, options: IpcTransportOptions): CollaborationTransport {
  const api = typeof window !== 'undefined' ? window.electronAPI?.collab : undefined;
  if (!api) {
    return { room, getPeers: () => [], destroy: () => undefined };
  }
  const clientId = `peer:${crypto.randomUUID()}`;
  const name = options.name?.trim() || guestPeerName(clientId.slice(5, 9));
  const remoteOrigin = { source: 'collab-ipc' };
  let peers: CollaborationPeer[] = [];
  let connectionId: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const notify = () => options.onPresence?.(peers);
  const post = (message: WireMessage) => {
    if (connectionId) void api.send(connectionId, { room, ...message });
  };

  const heartbeat = () => {
    const at = Date.now();
    peers = prunePeers(upsertPeer(peers, { id: clientId, name, at }), at, PEER_TTL_MS);
    notify();
    post({ type: 'presence', peer: { id: clientId, name, at } });
  };

  const onLocalUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === remoteOrigin) return;
    post({ type: 'update', update: Array.from(update) });
  };

  const onAwarenessUpdate = (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown): void => {
    if (!options.awareness || origin === remoteOrigin) return;
    const changed = [...changes.added, ...changes.updated, ...changes.removed];
    post({ type: 'awareness', awareness: Array.from(encodeAwarenessUpdate(options.awareness, changed)) });
  };

  const handle = (message: WireMessage): void => {
    if (message.type === 'update' && message.update) {
      Y.applyUpdate(doc, new Uint8Array(message.update), remoteOrigin);
      options.onRemoteUpdate?.();
    } else if (message.type === 'awareness' && message.awareness && options.awareness) {
      applyAwarenessUpdate(options.awareness, new Uint8Array(message.awareness), remoteOrigin);
    } else if (message.type === 'sync-request') {
      post({ type: 'update', update: Array.from(Y.encodeStateAsUpdate(doc)) });
      if (options.awareness) {
        post({ type: 'awareness', awareness: Array.from(encodeAwarenessUpdate(options.awareness, [...options.awareness.getStates().keys()])) });
      }
      heartbeat();
    } else if (message.type === 'presence' && message.peer) {
      const incoming = message.peer;
      peers = prunePeers(upsertPeer(peers, incoming), Date.now(), PEER_TTL_MS);
      notify();
    }
  };

  const unsubscribe = api.onMessage((id, message) => {
    if (id !== connectionId) return;
    handle(message as WireMessage);
  });

  void api.open(options.url).then((result) => {
    if (!result.ok || !result.id) return;
    connectionId = result.id;
    doc.on('update', onLocalUpdate);
    options.awareness?.on('update', onAwarenessUpdate);
    post({ type: 'sync-request' });
    heartbeat();
    timer = setInterval(heartbeat, HEARTBEAT_MS);
  });

  return {
    room,
    getPeers: () => peers,
    destroy: () => {
      if (timer) clearInterval(timer);
      doc.off('update', onLocalUpdate);
      options.awareness?.off('update', onAwarenessUpdate);
      unsubscribe();
      if (connectionId) void api.close(connectionId);
      connectionId = null;
    },
  };
}
