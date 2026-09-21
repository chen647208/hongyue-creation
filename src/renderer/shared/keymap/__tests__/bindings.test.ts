/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import {
  deserializeKeybindings,
  eventToBinding,
  findConflicts,
  formatBinding,
  isReservedBinding,
  matchEvent,
  normalizeBinding,
  parseBinding,
  serializeKeybindings,
} from '../bindings';
import { resolveKeybindings } from '../commands';
import type { KeyEventLike } from '../types';

const event = (over: Partial<KeyEventLike>): KeyEventLike => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  key: 'a',
  ...over,
});

describe('parseBinding', () => {
  it('解析主修饰键与 Shift/Alt', () => {
    expect(parseBinding('Ctrl+Shift+K')).toEqual({ ctrl: true, shift: true, alt: false, key: 'k' });
    expect(parseBinding('Ctrl+Alt+P')).toEqual({ ctrl: true, shift: false, alt: true, key: 'p' });
  });

  it('Cmd/Meta 归一到主修饰键', () => {
    expect(parseBinding('Cmd+K')?.ctrl).toBe(true);
    expect(parseBinding('Meta+K')?.ctrl).toBe(true);
  });

  it('符号与数字键保留', () => {
    expect(parseBinding('Ctrl+=')?.key).toBe('=');
    expect(parseBinding('Ctrl+-')?.key).toBe('-');
    expect(parseBinding('Ctrl+0')?.key).toBe('0');
    expect(parseBinding('Ctrl+,')?.key).toBe(',');
  });

  it('命名键取规范名', () => {
    expect(parseBinding('Ctrl+Esc')?.key).toBe('Escape');
    expect(parseBinding('Ctrl+Up')?.key).toBe('ArrowUp');
    expect(parseBinding('F5')?.key).toBe('F5');
  });

  it('非法输入返回 null', () => {
    expect(parseBinding('')).toBeNull();
    expect(parseBinding('Ctrl+')).toBeNull();
    expect(parseBinding('Ctrl+Foo')).toBeNull();
    expect(parseBinding('Ctrl+Shift')).toBeNull();
  });
});

describe('normalizeBinding', () => {
  it('统一大小写与修饰键顺序并归一别名', () => {
    expect(normalizeBinding('ctrl+shift+k')).toBe('Ctrl+Shift+K');
    expect(normalizeBinding('CMD+K')).toBe('Ctrl+K');
    expect(normalizeBinding('shift+ctrl+k')).toBe('Ctrl+Shift+K');
    expect(normalizeBinding('ctrl+=')).toBe('Ctrl+=');
    expect(normalizeBinding('nope')).toBeNull();
  });
});

describe('eventToBinding', () => {
  it('Ctrl/Cmd 组合序列化，无主修饰键返回 null', () => {
    expect(eventToBinding(event({ ctrlKey: true, key: 'k' }))).toBe('Ctrl+K');
    expect(eventToBinding(event({ metaKey: true, key: 'K' }))).toBe('Ctrl+K');
    expect(eventToBinding(event({ ctrlKey: true, shiftKey: true, key: 'K' }))).toBe('Ctrl+Shift+K');
    expect(eventToBinding(event({ altKey: true, key: 'p' }))).toBe('Alt+P');
    expect(eventToBinding(event({ ctrlKey: true, key: '=' }))).toBe('Ctrl+=');
    expect(eventToBinding(event({ key: 'k' }))).toBeNull();
  });

  it('修饰键自身与未知命名键不成绑定', () => {
    expect(eventToBinding(event({ ctrlKey: true, key: 'Control' }))).toBeNull();
    expect(eventToBinding(event({ ctrlKey: true, key: 'FancyKey' }))).toBeNull();
  });
});

describe('matchEvent', () => {
  it('主修饰键命中 Ctrl 与 Cmd', () => {
    expect(matchEvent('Ctrl+K', event({ ctrlKey: true, key: 'k' }))).toBe(true);
    expect(matchEvent('Ctrl+K', event({ metaKey: true, key: 'K' }))).toBe(true);
    expect(matchEvent('Ctrl+K', event({ metaKey: true, shiftKey: true, key: 'K' }))).toBe(false);
  });

  it('Shift/Alt 精确匹配', () => {
    expect(matchEvent('Ctrl+Shift+K', event({ ctrlKey: true, shiftKey: true, key: 'K' }))).toBe(true);
    expect(matchEvent('Ctrl+Shift+K', event({ ctrlKey: true, shiftKey: true, altKey: true, key: 'K' }))).toBe(false);
    expect(matchEvent('Ctrl+=', event({ ctrlKey: true, shiftKey: true, key: '+' }))).toBe(false);
  });
});

describe('formatBinding', () => {
  it('mac 连写 ⌘⇧，其余用加号', () => {
    expect(formatBinding('Ctrl+Shift+K', true)).toBe('⌘⇧K');
    expect(formatBinding('Ctrl+Shift+K', false)).toBe('Ctrl+Shift+K');
    expect(formatBinding('Ctrl+=', true)).toBe('⌘=');
    expect(formatBinding('Ctrl+-', false)).toBe('Ctrl+-');
  });
});

describe('findConflicts', () => {
  it('同串其他命令即冲突，自身除外', () => {
    const resolved = { ...resolveKeybindings(), find: 'Ctrl+K' };
    expect(findConflicts(resolved, 'find', 'ctrl+k')).toEqual(['commandPalette']);
    expect(findConflicts(resolved, 'find', 'Ctrl+Z')).toEqual([]);
  });
});

describe('isReservedBinding', () => {
  it('屏蔽清单内的组合提示保留，其余放行', () => {
    expect(isReservedBinding('Ctrl+P')).toBe(true);
    expect(isReservedBinding('Ctrl+Shift+I')).toBe(true);
    expect(isReservedBinding('Ctrl+Shift+J')).toBe(true);
    expect(isReservedBinding('F5')).toBe(true);
    expect(isReservedBinding('Ctrl+J')).toBe(false);
    expect(isReservedBinding('Ctrl+F')).toBe(false);
    expect(isReservedBinding('Ctrl+Alt+P')).toBe(false);
    expect(isReservedBinding('Ctrl+F5')).toBe(false);
  });
});

describe('serialize/deserialize', () => {
  it('归一化后稳定序列化', () => {
    expect(serializeKeybindings({ find: 'ctrl+shift+f' })).toBe('{"find":"Ctrl+Shift+F"}');
    expect(serializeKeybindings({})).toBe('{}');
  });

  it('反序列化过滤脏数据与非法键', () => {
    expect(deserializeKeybindings('{"find":"ctrl+shift+f","ghost":"Ctrl+G","zoomIn":42}')).toEqual({ find: 'Ctrl+Shift+F' });
    expect(deserializeKeybindings('not json')).toEqual({});
    expect(deserializeKeybindings('[1,2]')).toEqual({});
    expect(deserializeKeybindings(null)).toEqual({});
  });

  it('序列化与反序列化互逆', () => {
    const map = { commandPalette: 'Ctrl+Shift+P', zoomIn: 'Alt+=' };
    expect(deserializeKeybindings(serializeKeybindings(map))).toEqual(map);
  });
});
