/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 工作台侧栏外框：标题栏 + 关闭按钮 + 拖宽手柄。
 *
 * 写作侧栏、写作工具面板、助手侧栏共用同一套外形与交互，避免各写一份宽度逻辑。
 * 宽度由调用方持有（通常配 `useViewPreference` 记在 localStorage），本组件只上报拖动结果。
 */
import { GripVertical, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef } from 'react';

import { cn } from '../utils/cn';
import { Button } from './Button';

export interface SidePanelProps {
  title: React.ReactNode;
  /** 面板贴在哪一侧；手柄画在朝向正文的那条边上。 */
  side: 'left' | 'right';
  width: number;
  /** 拖动回调：拿到限制在 min/max 之间的整数宽度。 */
  onWidthChange: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  onClose: () => void;
  closeLabel: string;
  /** 拖宽手柄的可读标签（悬停提示与读屏共用）。 */
  resizeLabel: string;
  /** 标题栏右侧、关闭按钮之前的附加操作。 */
  actions?: React.ReactNode;
  /** 滚动内容区的外层类名追加。 */
  contentClassName?: string;
  children: React.ReactNode;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  title,
  side,
  width,
  onWidthChange,
  minWidth = 240,
  maxWidth = 560,
  onClose,
  closeLabel,
  resizeLabel,
  actions,
  contentClassName,
  children,
}) => {
  const draggingRef = useRef(false);
  // 拖动期间读的是 DOM 里最新的宽度；用 ref 保存，避免每次 mousemove 重建监听。
  const widthRef = useRef(width);
  widthRef.current = width;
  const onWidthChangeRef = useRef(onWidthChange);
  onWidthChangeRef.current = onWidthChange;

  const handlePointerDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      draggingRef.current = true;
      const startX = event.clientX;
      const startWidth = widthRef.current;
      const direction = side === 'left' ? 1 : -1;

      const onMove = (moveEvent: MouseEvent) => {
        if (!draggingRef.current) return;
        const raw = startWidth + (moveEvent.clientX - startX) * direction;
        onWidthChangeRef.current(Math.min(maxWidth, Math.max(minWidth, Math.round(raw))));
      };
      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [maxWidth, minWidth, side],
  );

  // 键盘等价：聚焦手柄后左右箭头每次 16px，Home/End 到上下限。
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = 16;
      const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
      const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
      let next: number | null = null;
      if (event.key === grow) next = widthRef.current + step;
      else if (event.key === shrink) next = widthRef.current - step;
      else if (event.key === 'Home') next = minWidth;
      else if (event.key === 'End') next = maxWidth;
      if (next === null) return;
      event.preventDefault();
      onWidthChangeRef.current(Math.min(maxWidth, Math.max(minWidth, next)));
    },
    [maxWidth, minWidth, side],
  );

  // 卸载时若仍在拖动，清掉挂在 window 上的监听与全局光标样式。
  useEffect(
    () => () => {
      draggingRef.current = false;
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    },
    [],
  );

  return (
    <div
      className={cn(
        'relative flex h-full flex-col bg-card',
        side === 'left' ? 'border-r border-border' : 'border-l border-border',
      )}
      // 窗口放不下时按 flex 规则收缩到 minWidth，正文区因此不会被挤没；
      // 窗口恢复后回到用户设定的宽度。
      style={{ width, minWidth, flexShrink: 1 }}
    >
      {/* 手柄是按钮语义的分隔条：鼠标拖动与方向键都能调宽，读屏按普通按钮播报。 */}
      <div
        role="button"
        tabIndex={0}
        aria-label={resizeLabel}
        title={resizeLabel}
        onMouseDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        className={cn(
          'group absolute inset-y-0 z-10 flex w-1.5 cursor-col-resize items-center justify-center transition-colors hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-none',
          side === 'left' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2',
        )}
      >
        <span className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100">
          <GripVertical className="size-3 text-muted-foreground" />
        </span>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="min-w-0 truncate text-sm font-medium text-foreground">{title}</div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', contentClassName)}>{children}</div>
    </div>
  );
};

export default SidePanel;
