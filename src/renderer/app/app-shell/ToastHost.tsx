/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { toast, type ToastItem } from '@/shared/services/toastService';
import { cn } from '@/shared/utils/cn';

const KIND_STYLE: Record<ToastItem['kind'], { icon: typeof Info; tone: string }> = {
  success: { icon: CheckCircle2, tone: 'text-success' },
  error: { icon: XCircle, tone: 'text-destructive' },
  info: { icon: Info, tone: 'text-muted-foreground' },
};

/** toastService 的渲染宿主：App 外壳挂载一次。 */
export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => toast.subscribe(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-overlay flex w-80 flex-col gap-2">
      {toasts.map(item => {
        const { icon: Icon, tone } = KIND_STYLE[item.kind];
        return (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md animate-slide-up"
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', tone)} />
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{item.message}</p>
            <button
              onClick={() => toast.dismiss(item.id)}
              className="touch-target shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
