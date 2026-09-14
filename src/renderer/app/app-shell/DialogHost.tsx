/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { AlertTriangle, CircleAlert, CircleCheck, Info, type LucideIcon,SquarePen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '@/i18n';

import { type AlertOptions, type ConfirmOptions, dialogService, type PromptOptions } from '../../shared/services/dialogService';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Input';

type Front =
  | { kind: 'confirm'; options: ConfirmOptions }
  | { kind: 'alert'; options: AlertOptions }
  | { kind: 'prompt'; options: PromptOptions }
  | null;

const TONE_ICON: Record<NonNullable<AlertOptions['tone']>, { icon: LucideIcon; cls: string }> = {
  info: { icon: Info, cls: 'text-primary' },
  success: { icon: CircleCheck, cls: 'text-success' },
  error: { icon: CircleAlert, cls: 'text-destructive' },
  warning: { icon: AlertTriangle, cls: 'text-warning' },
};

/**
 * 全局对话框宿主：订阅 dialogService 队列，渲染队首对话框。
 * 键盘可达：Esc 取消（confirm/prompt）/关闭（alert），Enter 触发主操作；主控件自动聚焦。
 * 应挂载在应用根部一次即可，任意组件/服务通过 dialogService 调用。
 */
const DialogHost: React.FC = () => {
  const { t } = useTranslation('common');
  const [front, setFront] = useState<Front>(null);
  const [text, setText] = useState('');
  const primaryRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return dialogService.subscribe((queue) => {
      const head = queue[0];
      if (head) {
        setFront({ kind: head.kind, options: head.options });
        if (head.kind === 'prompt') setText(head.options.defaultValue ?? '');
      } else {
        setFront(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!front) return;
    if (front.kind === 'prompt') inputRef.current?.focus();
    else primaryRef.current?.focus();
  }, [front]);

  if (!front) return null;

  const settle = (value: boolean) => dialogService.settle(value, front.kind === 'prompt' ? text : undefined);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      settle(front.kind === 'alert' ? true : false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal flex animate-fade-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="presentation"
      onKeyDown={onKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={front.options.title ?? t('dialog.untitled')}
        className="flex w-full max-w-md animate-zoom-in flex-col rounded-xl border border-border bg-card p-7 text-left shadow-lg"
      >
        <div className="flex items-start gap-3">
          {front.kind === 'alert' && (() => {
            const { icon: ToneIcon, cls } = TONE_ICON[front.options.tone ?? 'info'];
            return <ToneIcon className={`mt-0.5 size-6 ${cls}`} />;
          })()}
          {front.kind === 'confirm' && front.options.danger && (
            <AlertTriangle className="mt-0.5 size-6 text-destructive" />
          )}
          {front.kind === 'prompt' && (
            <SquarePen className="mt-0.5 size-6 text-primary" />
          )}
          <div className="flex-1">
            {front.options.title && (
              <h3 className="mb-1 text-lg font-semibold text-foreground">{front.options.title}</h3>
            )}
            <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{front.options.message}</p>
          </div>
        </div>

        {front.kind === 'prompt' && (
          <Input
            ref={inputRef}
            type="text"
            value={text}
            placeholder={front.options.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                settle(true);
              }
            }}
            className="mt-5"
          />
        )}

        <div className="flex gap-3 mt-7">
          {front.kind !== 'alert' && (
            <Button variant="secondary" className="flex-1" onClick={() => settle(false)}>
              {front.options.cancelText ?? t('cancel')}
            </Button>
          )}
          <Button
            ref={primaryRef}
            variant={front.kind === 'confirm' && front.options.danger ? 'destructive' : 'default'}
            className="flex-1"
            onClick={() => settle(true)}
          >
            {front.options.confirmText ?? (front.kind === 'alert' ? t('dialog.gotIt') : t('confirm'))}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DialogHost;
