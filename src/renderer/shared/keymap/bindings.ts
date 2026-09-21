/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 绑定串的解析、匹配、格式化、冲突检测与序列化（纯函数，无 DOM/存储依赖）。
 *
 * 绑定串形如 `Ctrl+Shift+K`。`Ctrl` 是主修饰键：Windows/Linux 为 Ctrl，mac 为 Cmd。
 * 键名规范：字母统一小写存储、单字符大写展示、命名键首字母大写（`Escape`、`ArrowUp`）。
 */

import { BLOCKED_PLAIN_KEYS, isReservedBrowserShortcut } from '@shared/constants/browserShortcuts';

import { isKeybindingActionId, KEYBINDING_ACTION_IDS } from './commands';
import type { KeybindingActionId, KeybindingMap, KeyEventLike, ParsedBinding } from './types';

/** 按键事件中代表「修饰键自身」的 key，不构成绑定。 */
const MODIFIER_EVENT_KEYS: ReadonlySet<string> = new Set(['Control', 'Meta', 'Alt', 'Shift', 'AltGraph']);

/** 命名键别名 → 规范键名。 */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  tab: 'Tab',
  space: 'Space',
  spacebar: 'Space',
  ' ': 'Space',
  backspace: 'Backspace',
  del: 'Delete',
  delete: 'Delete',
  insert: 'Insert',
  up: 'ArrowUp',
  arrowup: 'ArrowUp',
  down: 'ArrowDown',
  arrowdown: 'ArrowDown',
  left: 'ArrowLeft',
  arrowleft: 'ArrowLeft',
  right: 'ArrowRight',
  arrowright: 'ArrowRight',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};

/** 规范键 token：单字符大写展示，命名键取规范名，未知多字符返回 null。 */
function canonicalKey(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const named = NAMED_KEYS[lower];
  if (named) return named;
  if (/^f\d{1,2}$/.test(lower)) return lower.toUpperCase();
  if (trimmed.length === 1) return /[a-z0-9]/.test(lower) ? lower : trimmed;
  return null;
}

/** 展示用键 token：单字符统一大写。 */
function displayKeyToken(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key;
}

/** 规范修饰键 token 集合（`Ctrl` 代表主修饰键）。 */
function modifierOf(token: string): 'ctrl' | 'shift' | 'alt' | null {
  const lower = token.trim().toLowerCase();
  if (['ctrl', 'control', 'cmd', 'command', 'cmdorctrl', 'primary', 'meta', 'super', 'win', 'windows', '⌘'].includes(lower)) return 'ctrl';
  if (lower === 'shift' || lower === '⇧') return 'shift';
  if (lower === 'alt' || lower === 'option' || lower === '⌥') return 'alt';
  return null;
}

/** 解析绑定串；非法返回 null。 */
export function parseBinding(binding: string): ParsedBinding | null {
  const tokens = binding.split('+').map((token) => token.trim()).filter(Boolean);
  const keyToken = tokens[tokens.length - 1];
  if (keyToken === undefined) return null;
  tokens.length -= 1;
  let ctrl = false;
  let shift = false;
  let alt = false;
  for (const token of tokens) {
    const modifier = modifierOf(token);
    if (modifier === 'ctrl') ctrl = true;
    else if (modifier === 'shift') shift = true;
    else if (modifier === 'alt') alt = true;
    else return null;
  }
  const key = canonicalKey(keyToken);
  if (!key) return null;
  return { ctrl, shift, alt, key };
}

/** 解析后的绑定 → 规范串（修饰键顺序 Ctrl、Shift、Alt）。 */
export function serializeBinding(parsed: ParsedBinding): string {
  const parts: string[] = [];
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.shift) parts.push('Shift');
  if (parsed.alt) parts.push('Alt');
  parts.push(displayKeyToken(parsed.key));
  return parts.join('+');
}

/** 归一化为规范串；非法返回 null。 */
export function normalizeBinding(binding: string): string | null {
  const parsed = parseBinding(binding);
  return parsed ? serializeBinding(parsed) : null;
}

/** 键盘事件 → 规范绑定串；无主修饰键或 Alt、或按键为修饰键自身时返回 null。 */
export function eventToBinding(event: KeyEventLike): string | null {
  if (MODIFIER_EVENT_KEYS.has(event.key)) return null;
  const primary = event.ctrlKey || event.metaKey;
  if (!primary && !event.altKey) return null;
  const key = canonicalKey(event.key);
  if (!key) return null;
  return serializeBinding({ ctrl: primary, shift: event.shiftKey, alt: event.altKey, key });
}

/** 事件是否命中绑定（主修饰键、Shift、Alt 精确匹配）。 */
export function matchEvent(binding: string | undefined, event: KeyEventLike): boolean {
  if (!binding) return false;
  const parsed = parseBinding(binding);
  if (!parsed) return false;
  const primary = event.ctrlKey || event.metaKey;
  if (parsed.ctrl !== primary) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;
  const key = canonicalKey(event.key);
  return key !== null && key === parsed.key;
}

/** 展示串：mac 用 ⌘⇧⌥ 连写，其余用 Ctrl+Shift+Alt+键。 */
export function formatBinding(binding: string, isMac: boolean): string {
  const parsed = parseBinding(binding);
  if (!parsed) return binding;
  const key = displayKeyToken(parsed.key);
  const modifiers: string[] = [];
  if (parsed.ctrl) modifiers.push(isMac ? '⌘' : 'Ctrl');
  if (parsed.shift) modifiers.push(isMac ? '⇧' : 'Shift');
  if (parsed.alt) modifiers.push(isMac ? '⌥' : 'Alt');
  return isMac ? `${modifiers.join('')}${key}` : [...modifiers, key].join('+');
}

/** 冲突检测：与已解析绑定表同串的其他命令 id（自身除外）。 */
export function findConflicts(
  resolved: Record<KeybindingActionId, string>,
  action: KeybindingActionId,
  binding: string
): KeybindingActionId[] {
  const target = normalizeBinding(binding);
  if (!target) return [];
  return KEYBINDING_ACTION_IDS.filter((id) => id !== action && normalizeBinding(resolved[id]) === target);
}

/** 绑定是否落在主进程屏蔽的浏览器保留组合上（带 Alt 放行）。 */
export function isReservedBinding(binding: string): boolean {
  const parsed = parseBinding(binding);
  if (!parsed || parsed.alt) return false;
  if (!parsed.ctrl && BLOCKED_PLAIN_KEYS.has(parsed.key.toUpperCase())) return true;
  return isReservedBrowserShortcut(parsed.ctrl, parsed.shift, parsed.key);
}

/** 覆盖表 → 稳定 JSON 串（只保留合法命令与合法绑定）。 */
export function serializeKeybindings(map: KeybindingMap): string {
  const out: Record<string, string> = {};
  for (const id of KEYBINDING_ACTION_IDS) {
    const raw = map[id];
    if (typeof raw !== 'string') continue;
    const normalized = normalizeBinding(raw);
    if (normalized) out[id] = normalized;
  }
  return JSON.stringify(out);
}

/** 稳定 JSON 串 → 覆盖表；脏数据逐项丢弃，整体不可解析则空表。 */
export function deserializeKeybindings(raw: string | null | undefined): KeybindingMap {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: KeybindingMap = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isKeybindingActionId(id)) continue;
    if (typeof value !== 'string') continue;
    const normalized = normalizeBinding(value);
    if (normalized) out[id] = normalized;
  }
  return out;
}
