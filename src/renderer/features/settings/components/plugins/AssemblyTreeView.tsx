/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { AssemblyRow } from '@core/plugin';
import React from 'react';

/** 装配树实时视图：行随当前发行档即时重算，切换档位不用开关重看。 */
const AssemblyTreeView: React.FC<{ rows: AssemblyRow[] }> = ({ rows }) => (
  <div className="mt-2 overflow-x-auto rounded-lg border border-border p-3 font-mono text-xs">
    {rows.map((row) => (
      <div key={row.feature} className={row.enabled ? 'text-foreground' : 'text-muted-foreground'}>
        {row.enabled ? '✓' : '✗'} {row.feature} <span className="text-muted-foreground">← {row.source}{row.reason ? `（${row.reason}）` : ''}</span>
      </div>
    ))}
  </div>
);

export default AssemblyTreeView;
