/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React from 'react';

import { cn } from '@/shared/utils/cn';
import { getDisplayVersion } from '@/shared/version';

interface VersionBadgeProps {
  className?: string;
  prefix?: string;
}

/**
 * 模板化版本徽章：全应用唯一版本展示组件。
 * TopBar / 设置页 / 关于弹窗全部复用它，改版本号只改 package.json。
 */
export const VersionBadge: React.FC<VersionBadgeProps> = ({ className, prefix = '' }) => (
  <span
    className={cn(
      'rounded border border-border px-1.5 py-0.5 font-mono text-2xs text-foreground/70',
      className
    )}
    title={getDisplayVersion()}
  >
    {prefix}
    {getDisplayVersion()}
  </span>
);

export default VersionBadge;
