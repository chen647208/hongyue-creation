/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import * as React from 'react';

import { cn } from '../utils/cn';

export interface TabItem<T extends string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface TabBarProps<T extends string> {
  value: T;
  onChange: (id: T) => void;
  items: readonly TabItem<T>[];
  className?: string;
  /** underline：下划线横向；block：等宽图标在上（用于侧边分类）。 */
  variant?: 'underline' | 'block';
}

/** 受控页签条：展示型；内容由调用方按 value 条件渲染。 */
export function TabBar<T extends string>({ value, onChange, items, className, variant = 'underline' }: TabBarProps<T>): React.ReactElement {
  if (variant === 'block') {
    return (
      <div role="tablist" className={cn('flex shrink-0 overflow-x-auto border-b border-border bg-card', className)}>
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={value === id}
            onClick={() => onChange(id)}
            className={cn(
              'touch-target flex min-w-[60px] flex-1 flex-col items-center gap-1 border-b-2 py-3 text-2xs transition-colors',
              value === id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="size-4" />}
            <span>{label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div role="tablist" className={cn('flex gap-1 border-b border-border', className)}>
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            'touch-target -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === id
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {Icon && <Icon className="size-4" />}
          {label}
        </button>
      ))}
    </div>
  );
}
