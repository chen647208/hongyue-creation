/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 视口分级 hook：订阅窗口尺寸，返回 mobile / tablet / desktop。
 * 判定逻辑在 shared/utils/layout，本文件只负责订阅与清理。
 */

import { useEffect, useState } from 'react';

import { MOBILE_MAX_WIDTH, resolveViewportTier, type ViewportTier } from '@/shared/utils/layout';

const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

function readTier(): ViewportTier {
  if (typeof window === 'undefined') return 'desktop';
  return resolveViewportTier(window.innerWidth);
}

export function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>(readTier);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setTier(readTier());
    update();
    if (typeof window.matchMedia === 'function') {
      const query = window.matchMedia(MOBILE_QUERY);
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return tier;
}
