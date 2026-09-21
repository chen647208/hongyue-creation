/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { isBlockedBrowserShortcut, type ShortcutInput } from '../shortcuts.js';

const key = (over: Partial<ShortcutInput>): ShortcutInput => ({
  type: 'keyDown',
  key: 'a',
  control: false,
  shift: false,
  alt: false,
  meta: false,
  ...over,
});

describe('isBlockedBrowserShortcut', () => {
  it('屏蔽刷新与开发者工具功能键', () => {
    expect(isBlockedBrowserShortcut(key({ key: 'F5' }))).toBe(true);
    expect(isBlockedBrowserShortcut(key({ key: 'F12' }))).toBe(true);
  });

  it('屏蔽 Ctrl/Cmd 修饰的刷新、开发者工具与打印', () => {
    expect(isBlockedBrowserShortcut(key({ key: 'r', control: true }))).toBe(true);
    expect(isBlockedBrowserShortcut(key({ key: 'R', meta: true }))).toBe(true);
    expect(isBlockedBrowserShortcut(key({ key: 'r', control: true, shift: true }))).toBe(true);
    expect(isBlockedBrowserShortcut(key({ key: 'i', control: true, shift: true }))).toBe(true);
    expect(isBlockedBrowserShortcut(key({ key: 'j', control: true, shift: true }))).toBe(true);
    expect(isBlockedBrowserShortcut(key({ key: 'c', control: true, shift: true }))).toBe(true);
    expect(isBlockedBrowserShortcut(key({ key: 'p', control: true }))).toBe(true);
  });

  it('放行编辑快捷键与带 Alt 的组合', () => {
    expect(isBlockedBrowserShortcut(key({ key: 'c', control: true }))).toBe(false);
    expect(isBlockedBrowserShortcut(key({ key: 'v', control: true }))).toBe(false);
    expect(isBlockedBrowserShortcut(key({ key: 'z', control: true }))).toBe(false);
    expect(isBlockedBrowserShortcut(key({ key: 'f', control: true }))).toBe(false);
    expect(isBlockedBrowserShortcut(key({ key: 'i', control: true }))).toBe(false);
    expect(isBlockedBrowserShortcut(key({ key: 'r', control: true, shift: false, alt: true }))).toBe(false);
  });

  it('只处理 keyDown，忽略其它事件类型', () => {
    expect(isBlockedBrowserShortcut(key({ key: 'F5', type: 'keyUp' }))).toBe(false);
    expect(isBlockedBrowserShortcut(key({ key: 'r', control: true, type: 'char' }))).toBe(false);
  });
});
