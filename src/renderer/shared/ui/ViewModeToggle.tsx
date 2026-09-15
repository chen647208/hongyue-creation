/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { LucideIcon } from 'lucide-react';
import React from 'react';

import { cn } from '@/shared/utils/cn';

import { Button } from './Button';

interface ViewModeToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; icon: LucideIcon; title: string }>;
  className?: string;
}

/**
 * 视图形态切换（卡片 ⇄ 横栏）：书架/细纲/历史等多列表共用，样式锁死一份。
 * 对标 Scrivener 的 Corkboard/Outliner 切换键。
 */
export function ViewModeToggle<T extends string>({ value, onChange, options, className }: ViewModeToggleProps<T>): React.ReactElement {
  return (
    <div className={cn('flex rounded-lg border border-border p-0.5', className)}>
      {options.map((opt) => (
        <Button
          key={opt.value}
          variant="ghost"
          size="icon"
          className={cn('size-7', value === opt.value ? 'bg-accent text-foreground' : 'text-muted-foreground')}
          onClick={() => onChange(opt.value)}
          title={opt.title}
        >
          <opt.icon className="size-4" />
        </Button>
      ))}
    </div>
  );
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  className?: string;
  size?: 'sm' | 'md';
}

/** 分段选择（一行页签）：结构页大纲/细纲、批量模式等共用，替代各处手写 inline-flex。 */
export function SegmentedControl<T extends string>({ value, onChange, options, className, size = 'md' }: SegmentedControlProps<T>): React.ReactElement {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          disabled={opt.disabled}
          className={cn(
            'touch-target rounded-md px-3 py-1.5 font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
            size === 'sm' ? 'text-xs' : 'text-sm',
            value === opt.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
