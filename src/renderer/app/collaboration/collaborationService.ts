/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 协作会话：以作品为房间，Y.Doc 为协作副本。
 * 同机多窗口走 BroadcastChannel；填了中转地址则经主进程 WebSocket 跨设备同步。
 * 持久化仍走既有 projectStore → sqlite 链路，Y.Doc 不落第二个存储。
 * 章节列表与正文、画布元素状态共用同一份 Y.Doc（画布结构见 canvasDoc.ts）。
 */
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import { useEffect, useMemo } from 'react';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { create } from 'zustand';

import { type CollaborationPeer, type CollaborationTransport,createBroadcastTransport } from '@/features/collaboration/broadcastTransport';
import { editorContentCodec } from '@/features/collaboration/editorBinding';
import { createIpcTransport } from '@/features/collaboration/ipcTransport';
import { applyProjectToDoc, docToProjectPatch, getChapterFragment } from '@/features/collaboration/projectDoc';
import { parseViewLayout, serializeViewLayout } from '@/features/views/viewLayout';
import { localStore } from '@/shared/services/localStore';
import { logger } from '@/shared/utils/logger';

import { useGenericModelStore } from '../stores/genericModelStore';
import { useProjectStore } from '../stores/projectStore';
import {
  applyCanvasLayoutToDoc,
  CANVAS_LOCAL_ORIGIN,
  CANVAS_SEED_ORIGIN,
  docCanvasStates,
  docToCanvasLayout,
  purgeCanvasTombstones,
  sameCanvasLayout,
} from './canvasDoc';

interface CollaborationSession {
  projectId: string;
  room: string;
  doc: Y.Doc;
  awareness: Awareness;
  transport: CollaborationTransport;
  unsubscribe: () => void;
  /** 视图存储订阅：本地画布布局变化推送进文档。 */
  unsubscribeCanvas: () => void;
}

interface CollaborationState {
  enabled: boolean;
  peers: CollaborationPeer[];
  serverUrl: string;
  sessionProjectId: string | null;
  setEnabled: (enabled: boolean) => void;
  setServerUrl: (url: string) => void;
}

let session: CollaborationSession | null = null;
let applyingRemote = false;
/** 画布握手窗口内不推送：等播种或对端状态到达后再决定推送方向。 */
let canvasReady = false;
/** 正在把文档画布状态写回视图存储：写回触发的视图变化不再推送，避免环流。 */
let applyingRemoteCanvas = false;
/** 画布拉取串行化：连续多个远程更新按到达顺序合并写回，后到者不覆盖先到者。 */
let canvasPullQueue: Promise<void> = Promise.resolve();
/** 已与文档对齐过的视图 id：首次见到文档有画布状态的视图先拉齐，避免本地陈旧配置反压对端。 */
const adoptedCanvasViews = new Set<string>();
/** 每个视图最近一次与文档对齐的 config（JSON）。store 触发的推送只在 config 真正变化时执行，
 * 否则「收到远程墓碑 → pull 完成前」的任何 store 触发都会用陈旧 config 把已删元素复活。 */
const canvasSyncedConfigs = new Map<string, string>();

/** 协作光标颜色池。 */
const PEER_COLORS = ['#e5484d', '#0091ff', '#30a46c', '#f76b15', '#8e4ec6', '#e93d82'];

/** 播种前的等待时间：给对端一个回包窗口，避免各自播种。 */
const SEED_GRACE_MS = 400;

function readEnabled(): boolean {
  try {
    return localStore.getItem(STORAGE_KEYS.collabEnabled) === '1';
  } catch {
    return false;
  }
}

function readServerUrl(): string {
  try {
    return localStore.getItem(STORAGE_KEYS.collabServerUrl) ?? '';
  } catch {
    return '';
  }
}

export const useCollaborationStore = create<CollaborationState>()((set) => ({
  enabled: readEnabled(),
  peers: [],
  serverUrl: readServerUrl(),
  sessionProjectId: null,
  setEnabled: (enabled) => {
    set({ enabled });
    localStore.setItem(STORAGE_KEYS.collabEnabled, enabled ? '1' : '0');
  },
  setServerUrl: (url) => {
    set({ serverUrl: url });
    localStore.setItem(STORAGE_KEYS.collabServerUrl, url);
  },
}));

export function isCollaborationEnabled(): boolean {
  return useCollaborationStore.getState().enabled;
}

/** 把某视图的画布布局推送进文档；文档已有该视图状态且本地从未对齐过时，先以文档为准拉取。 */
function pushCanvasView(doc: Y.Doc, projectId: string, viewId: string, config: Record<string, unknown>): void {
  const serialized = JSON.stringify(config);
  if (canvasSyncedConfigs.get(viewId) === serialized) return;
  if (!adoptedCanvasViews.has(viewId)) {
    adoptedCanvasViews.add(viewId);
    // 首次见到文档已有该视图状态：本地配置可能落后于文档，直接推送会用陈旧数据覆盖对端，改为先拉齐。
    if (docCanvasStates(doc, viewId).length > 0) {
      queueCanvasPull(doc, projectId);
      return;
    }
  }
  const parsedLayout = parseViewLayout(config);
  // 视图不是画布形态：与协作画布无关，不推送（快照仍更新，避免切回画布形态时误推陈旧数据）。
  if (parsedLayout.kind !== 'canvas') {
    canvasSyncedConfigs.set(viewId, serialized);
    return;
  }
  // 画布内容为空（全部元素被删）也要推送：applyCanvasLayoutToDoc 靠「seed 缺席」给残留元素发墓碑。
  // 空画布在序列化层被折叠成「canvas 键缺席」，此前这里因 layout 为 undefined 直接 return，
  // 删除动作永远到不了对端。
  applyCanvasLayoutToDoc(doc, viewId, parsedLayout.canvas ?? {});
  canvasSyncedConfigs.set(viewId, serialized);
}

/** 无对端响应用本地视图播种画布：作为该视图画布元素的首批状态（版本 1）。 */
function seedCanvasToDoc(doc: Y.Doc, projectId: string): void {
  const store = useGenericModelStore.getState();
  if (store.workId !== projectId) return;
  for (const view of store.views) {
    const layout = parseViewLayout(view.config).canvas;
    if (!layout) continue;
    adoptedCanvasViews.add(view.id);
    canvasSyncedConfigs.set(view.id, JSON.stringify(view.config));
    applyCanvasLayoutToDoc(doc, view.id, layout, CANVAS_SEED_ORIGIN);
  }
}

function queueCanvasPull(doc: Y.Doc, projectId: string): void {
  canvasPullQueue = canvasPullQueue
    .then(() => pullCanvasFromDoc(doc, projectId))
    .catch((error) => {
      logger.error('同步画布协作状态失败:', error);
    });
}

/** 把文档中的画布状态写回视图存储：只覆盖文档已有状态的视图，文档无状态的视图保持本地配置。 */
async function pullCanvasFromDoc(doc: Y.Doc, projectId: string): Promise<void> {
  const store = useGenericModelStore.getState();
  if (store.workId !== projectId) return;
  applyingRemoteCanvas = true;
  try {
    for (const view of store.views) {
      const docLayout = docToCanvasLayout(doc, view.id);
      if (!docLayout) {
        // 文档已无该视图的画布状态（元素被删且墓碑已清）：本地配置是陈旧数据，
        // 不拉齐的话下一次 store 触发会把旧元素整批复活。
        if (adoptedCanvasViews.has(view.id) && parseViewLayout(view.config).canvas) {
          const config = serializeViewLayout({ ...parseViewLayout(view.config), canvas: undefined });
          canvasSyncedConfigs.set(view.id, JSON.stringify(config));
          await useGenericModelStore.getState().saveView({ ...view, config });
        }
        continue;
      }
      adoptedCanvasViews.add(view.id);
      const current = parseViewLayout(view.config);
      if (sameCanvasLayout(current.canvas, docLayout)) continue;
      const config = serializeViewLayout({ ...current, canvas: docLayout });
      canvasSyncedConfigs.set(view.id, JSON.stringify(config));
      await useGenericModelStore.getState().saveView({ ...view, config });
    }
  } finally {
    applyingRemoteCanvas = false;
  }
}

export function getCollaborationSession(): { projectId: string; room: string } | null {
  return session ? { projectId: session.projectId, room: session.room } : null;
}

export function startCollaboration(projectId: string): void {
  if (session?.projectId === projectId) return;
  stopCollaboration();
  const project = useProjectStore.getState().projects.find((item) => item.id === projectId);
  if (!project) return;

  const room = `book:${projectId}`;
  const doc = new Y.Doc();
  let receivedRemote = false;
  const serverUrl = useCollaborationStore.getState().serverUrl.trim();
  const awareness = new Awareness(doc);
  const localName = `用户-${crypto.randomUUID().slice(0, 4)}`;
  awareness.setLocalStateField('user', { name: localName, color: PEER_COLORS[awareness.clientID % PEER_COLORS.length] });
  const transportOptions = {
    awareness,
    onPresence: (peers: CollaborationPeer[]) => useCollaborationStore.setState({ peers }),
    onRemoteUpdate: () => {
      receivedRemote = true;
    },
  };
  const transport = serverUrl
    ? createIpcTransport(doc, room, { ...transportOptions, url: serverUrl })
    : createBroadcastTransport(doc, room, transportOptions);

  const onDocUpdate = (_update: Uint8Array, origin: unknown): void => {
    // 本地写入与播种不回写：章节与画布各自处理，避免本地写入被当成远程更新再环流。
    if (origin === 'local-project' || origin === 'seed' || origin === CANVAS_LOCAL_ORIGIN || origin === CANVAS_SEED_ORIGIN) return;
    applyingRemote = true;
    try {
      useProjectStore.getState().updateProject(projectId, docToProjectPatch(doc, editorContentCodec));
    } finally {
      applyingRemote = false;
    }
    // 收到对端状态即视为一个同步轮次完成：拉齐画布并清除墓碑。
    queueCanvasPull(doc, projectId);
    purgeCanvasTombstones(doc);
  };
  doc.on('update', onDocUpdate);

  const unsubscribe = useProjectStore.subscribe((state) => {
    if (applyingRemote || state.activeProjectId !== projectId) return;
    const local = state.projects.find((item) => item.id === projectId);
    if (!local) return;
    applyProjectToDoc(doc, local, editorContentCodec, 'local-project');
  });

  const unsubscribeCanvas = useGenericModelStore.subscribe((state) => {
    if (!canvasReady || applyingRemoteCanvas || state.workId !== projectId) return;
    for (const view of state.views) pushCanvasView(doc, projectId, view.id, view.config);
  });

  const current: CollaborationSession = { projectId, room, doc, awareness, transport, unsubscribe, unsubscribeCanvas };
  session = current;
  useCollaborationStore.setState({ sessionProjectId: projectId });

  // 播种握手：等待片刻确认没有对端后再用本地作品初始化，避免两端各自播种产生重复章节。
  setTimeout(() => {
    if (session !== current) return;
    if (!receivedRemote) {
      applyProjectToDoc(doc, project, editorContentCodec, 'seed');
      seedCanvasToDoc(doc, projectId);
    } else {
      // 对端已响应：以协作文档为准拉齐本地视图，避免界面停留在对端更新前的布局。
      queueCanvasPull(doc, projectId);
    }
    canvasReady = true;
  }, SEED_GRACE_MS);
}

export function stopCollaboration(): void {
  if (!session) return;
  session.unsubscribe();
  session.unsubscribeCanvas();
  session.transport.destroy();
  session.awareness.destroy();
  session.doc.destroy();
  session = null;
  canvasReady = false;
  applyingRemoteCanvas = false;
  canvasPullQueue = Promise.resolve();
  adoptedCanvasViews.clear();
  canvasSyncedConfigs.clear();
  useCollaborationStore.setState({ peers: [], sessionProjectId: null });
}

/** 取某章节的协作绑定（片段 + 在线状态），未加入或不是当前作品时返回 null。 */
export function getChapterCollab(projectId: string, chapterId: string | null): { fragment: Y.XmlFragment; awareness: Awareness } | null {
  if (!session || session.projectId !== projectId || !chapterId) return null;
  const fragment = getChapterFragment(session.doc, chapterId);
  if (!fragment) return null;
  return { fragment, awareness: session.awareness };
}

/** 编辑器接线：会话与章节变化时返回当前章节的协作绑定。 */
export function useChapterCollab(projectId: string | undefined, chapterId: string | null): { fragment: Y.XmlFragment; awareness: Awareness } | null {
  const enabled = useCollaborationStore((state) => state.enabled);
  const sessionProjectId = useCollaborationStore((state) => state.sessionProjectId);
  return useMemo(
    () => (enabled && projectId && sessionProjectId === projectId ? getChapterCollab(projectId, chapterId) : null),
    [enabled, projectId, sessionProjectId, chapterId],
  );
}

/** App 层接线：开关与当前作品变化时启停协作会话。 */
export function useCollaborationSync(): void {
  const enabled = useCollaborationStore((state) => state.enabled);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  useEffect(() => {
    if (enabled && activeProjectId) startCollaboration(activeProjectId);
    else stopCollaboration();
  }, [enabled, activeProjectId]);
}
