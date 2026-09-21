/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 快捷键 React 接线：解析绑定表 + 全局分支派发单监听。 */

import { useEffect, useMemo, useRef } from 'react';

import { matchEvent } from './bindings';
import { KEYBINDING_COMMANDS, resolveKeybindings } from './commands';
import { useKeymapStore } from './store';
import type { KeybindingActionId } from './types';

/** 命令处理器（未提供即不参与派发）。 */
export type KeymapHandlers = Partial<Record<KeybindingActionId, (event: KeyboardEvent) => void>>;

/** 已解析绑定表（默认 + 用户覆盖）。 */
export function useResolvedKeybindings(): Record<KeybindingActionId, string> {
  const overrides = useKeymapStore((state) => state.overrides);
  return useMemo(() => resolveKeybindings(overrides), [overrides]);
}

/**
 * 安装全局快捷键监听：按目录顺序匹配，命中即 preventDefault 并执行处理器。
 * 处理器与启用开关走 ref，避免闭包身份变化导致的重挂；仅绑定表变化时重挂。
 */
export function useGlobalKeymap(
  handlers: KeymapHandlers,
  options?: { enabled?: Partial<Record<KeybindingActionId, boolean>> }
): void {
  const bindings = useResolvedKeybindings();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const enabledRef = useRef(options?.enabled);
  enabledRef.current = options?.enabled;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      for (const command of KEYBINDING_COMMANDS) {
        const handler = handlersRef.current[command.id];
        if (!handler) continue;
        if (enabledRef.current?.[command.id] === false) continue;
        if (matchEvent(bindings[command.id], event)) {
          event.preventDefault();
          handler(event);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindings]);
}
