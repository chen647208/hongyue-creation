/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 协作对端身份：名字与光标颜色。
 *
 * 颜色必须是字面量十六进制：`@tiptap/extension-collaboration-caret` 用
 * `/^#[0-9a-fA-F]{6}$/` 校验，CSS 变量会被判为非法并回退成透明。
 * 因此调色板收在本文件作为唯一定义处，光标渲染、在线列表都从这里取色。
 */
import { uuidv7 } from '@core/entities';

import { i18n } from '@/i18n';

export interface PeerIdentity {
  name: string;
  color: string;
}

/** 光标颜色池：六个高饱和色，保证深浅两套主题下都与正文区分。 */
export const PEER_COLORS = ['#e5484d', '#0091ff', '#30a46c', '#f76b15', '#8e4ec6', '#e93d82'] as const;

/** 光标名字标签的文字色：上面六个底色都足够深，白字对比度达标。 */
export const PEER_LABEL_FOREGROUND = '#ffffff';

/** 按客户端编号取色：同一会话内编号稳定，颜色不会跳动。 */
export function peerColorFor(clientId: number): string {
  const index = Math.abs(clientId) % PEER_COLORS.length;
  return PEER_COLORS[index] ?? PEER_COLORS[0];
}

/** 未设置昵称时的默认名：`用户-3f2a` 这类短标识，同一房间内可区分。 */
export function guestPeerName(suffix: string): string {
  return i18n.t('settings:collab.guestName', { id: suffix });
}

/** 生成本地端身份：名字取四位短码，颜色按客户端编号从调色板取。 */
export function createLocalIdentity(clientId: number): PeerIdentity {
  return {
    name: guestPeerName(uuidv7().slice(0, 4)),
    color: peerColorFor(clientId),
  };
}
