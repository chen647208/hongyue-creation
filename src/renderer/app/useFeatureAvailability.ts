/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 发行档 → 功能可用性 hook：设置面板切换发行档后经 PROFILE_CHANGED_EVENT 刷新。 */
import { enabledFeatureIds, PROFILE_CHANGED_EVENT } from '@core/plugin/availability';
import { DEFAULT_RELEASE_PROFILE } from '@core/plugin/bundles';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import { useEffect, useState } from 'react';

import { localStore } from '@/shared/services/localStore';

export function useFeatureAvailability(): Set<string> {
  const [enabled, setEnabled] = useState<Set<string>>(() => enabledFeatureIds(localStore.getItem(STORAGE_KEYS.profileCurrent) ?? DEFAULT_RELEASE_PROFILE));

  useEffect(() => {
    const refresh = (): void => setEnabled(enabledFeatureIds(localStore.getItem(STORAGE_KEYS.profileCurrent) ?? DEFAULT_RELEASE_PROFILE));
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PROFILE_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return enabled;
}
