/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import { normalizeBinding } from '../bindings';
import {
  DEFAULT_KEYBINDINGS,
  groupKeybindingCommands,
  isKeybindingActionId,
  KEYBINDING_ACTION_IDS,
  KEYBINDING_COMMANDS,
  resolveKeybindings,
} from '../commands';

describe('命令目录', () => {
  it('默认绑定覆盖全部命令且 id 唯一', () => {
    expect(Object.keys(DEFAULT_KEYBINDINGS).sort()).toEqual([...KEYBINDING_ACTION_IDS].sort());
    expect(new Set(KEYBINDING_ACTION_IDS).size).toBe(KEYBINDING_ACTION_IDS.length);
  });

  it('默认绑定与历史硬编码一致', () => {
    expect(DEFAULT_KEYBINDINGS.toggleAssistant).toBe('Ctrl+J');
    expect(DEFAULT_KEYBINDINGS.find).toBe('Ctrl+F');
    expect(DEFAULT_KEYBINDINGS.commandPalette).toBe('Ctrl+K');
    expect(DEFAULT_KEYBINDINGS.section1).toBe('Ctrl+1');
    expect(DEFAULT_KEYBINDINGS.section5).toBe('Ctrl+5');
  });

  it('默认绑定互不冲突', () => {
    const normalized = KEYBINDING_COMMANDS.map((command) => normalizeBinding(command.defaultBinding));
    expect(normalized.every((binding) => binding !== null)).toBe(true);
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it('分组覆盖全部命令', () => {
    const grouped = groupKeybindingCommands().flatMap((group) => group.commands);
    expect(grouped).toHaveLength(KEYBINDING_COMMANDS.length);
  });
});

describe('isKeybindingActionId', () => {
  it('只认目录内 id', () => {
    expect(isKeybindingActionId('find')).toBe(true);
    expect(isKeybindingActionId('ghost')).toBe(false);
  });
});

describe('resolveKeybindings', () => {
  it('缺席回退默认', () => {
    expect(resolveKeybindings({ find: 'Ctrl+Shift+F' })).toEqual({ ...DEFAULT_KEYBINDINGS, find: 'Ctrl+Shift+F' });
    expect(resolveKeybindings()).toEqual(DEFAULT_KEYBINDINGS);
  });
});
