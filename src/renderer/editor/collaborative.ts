/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 协作模式的编辑器扩展：关闭 StarterKit 的 History，撤销由 y-prosemirror 的 yUndoPlugin 接管。 */
import type { Extensions } from '@tiptap/core';

import { createNovelExtensions, type NovelExtensionOptions } from './schema';

export function createCollaborativeExtensions(options: Omit<NovelExtensionOptions, 'undoRedo'> = {}): Extensions {
  return createNovelExtensions({ ...options, undoRedo: false });
}
