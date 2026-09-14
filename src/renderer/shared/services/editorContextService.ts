/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 编辑器上下文（渲染层单源）：写作编辑器发布当前活动章节与选中文本，
 * 助手装配 contextTarget 时读取，避免只靠任务文本反推章节。
 * 进程内内存态，不落盘、不跨窗口同步。
 */
export interface EditorContextState {
  /** 编辑器当前打开的章节 id。 */
  chapterId?: string;
  /** 编辑器当前选中的文本（用于解析选中实体）。 */
  selectionText?: string;
}

let current: EditorContextState = {};

/** 发布最新编辑器上下文（编辑器状态变化时调用）。 */
export function setEditorContext(next: EditorContextState): void {
  current = { chapterId: next.chapterId, selectionText: next.selectionText };
}

/** 读取编辑器上下文（助手发送前调用）。 */
export function getEditorContext(): EditorContextState {
  return current;
}

/** 清空编辑器上下文（编辑器卸载时调用，避免助手使用过期章节）。 */
export function resetEditorContext(): void {
  current = {};
}
