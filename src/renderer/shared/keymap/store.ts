/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 快捷键覆盖表的运行时状态与持久化。
 *
 * 键位属于安装级界面偏好，走 `localStore` 单出口（键见 storageKeys），不进业务
 * AppState：与视图偏好同层，不随作品数据同步。空表即回退默认，避免存一份冗余默认。
 */

import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import { create } from 'zustand';

import { localStore } from '../services/localStore';
import { deserializeKeybindings, normalizeBinding, serializeKeybindings } from './bindings';
import type { KeybindingActionId, KeybindingMap } from './types';

interface KeymapState {
  /** 用户覆盖：只存改动过的命令。 */
  overrides: KeybindingMap;
  setBinding: (action: KeybindingActionId, binding: string) => void;
  resetBinding: (action: KeybindingActionId) => void;
  resetAll: () => void;
}

function loadOverrides(): KeybindingMap {
  return deserializeKeybindings(localStore.getItem(STORAGE_KEYS.keybindings));
}

function persistOverrides(overrides: KeybindingMap): void {
  if (Object.keys(overrides).length === 0) {
    localStore.removeItem(STORAGE_KEYS.keybindings);
    return;
  }
  localStore.setItem(STORAGE_KEYS.keybindings, serializeKeybindings(overrides));
}

export const useKeymapStore = create<KeymapState>()((set) => ({
  overrides: loadOverrides(),
  setBinding: (action, binding) => {
    const normalized = normalizeBinding(binding);
    if (!normalized) return;
    set((state) => {
      const overrides: KeybindingMap = { ...state.overrides, [action]: normalized };
      persistOverrides(overrides);
      return { overrides };
    });
  },
  resetBinding: (action) =>
    set((state) => {
      const overrides: KeybindingMap = { ...state.overrides };
      delete overrides[action];
      persistOverrides(overrides);
      return { overrides };
    }),
  resetAll: () => {
    persistOverrides({});
    set({ overrides: {} });
  },
}));
