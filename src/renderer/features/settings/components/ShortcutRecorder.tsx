/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { RotateCcw } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { useTranslation } from '@/i18n';
import {
  eventToBinding,
  findConflicts,
  formatBinding,
  groupKeybindingCommands,
  isReservedBinding,
  type KeybindingActionId,
  useKeymapStore,
  useResolvedKeybindings,
} from '@/shared/keymap';
import { Button } from '@/shared/ui/Button';
import { Label } from '@/shared/ui/Label';

/** 录制结果提示：与其它命令冲突，或落在浏览器保留组合上。 */
type Notice = { kind: 'conflict'; action: KeybindingActionId } | { kind: 'reserved' } | null;

/**
 * 快捷键设置区：点击命令后按下组合键录入，支持单条与整体恢复默认。
 * 冲突组合与浏览器保留组合拒绝保存并给出提示；未配置即回退默认。
 */
const ShortcutRecorder: React.FC = () => {
  const { t } = useTranslation('settings');
  const overrides = useKeymapStore((s) => s.overrides);
  const setBinding = useKeymapStore((s) => s.setBinding);
  const resetBinding = useKeymapStore((s) => s.resetBinding);
  const resetAll = useKeymapStore((s) => s.resetAll);
  const resolved = useResolvedKeybindings();
  const [recording, setRecording] = useState<KeybindingActionId | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);
  const groups = groupKeybindingCommands();

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        return;
      }
      const binding = eventToBinding(event);
      if (!binding) return;
      if (isReservedBinding(binding)) {
        setNotice({ kind: 'reserved' });
        return;
      }
      const hits = findConflicts(resolved, recording, binding);
      const other = hits[0];
      if (other !== undefined) {
        setNotice({ kind: 'conflict', action: other });
        return;
      }
      setBinding(recording, binding);
      setNotice(null);
      setRecording(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, resolved, setBinding]);

  const noticeText = (): string | null => {
    if (!notice) return null;
    if (notice.kind === 'reserved') return t('general.shortcutReserved');
    return t('general.shortcutConflict', { action: t(`general.shortcutActions.${notice.action}`) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            resetAll();
            setNotice(null);
            setRecording(null);
          }}
        >
          <RotateCcw className="size-3.5" />
          {t('general.shortcutReset')}
        </Button>
      </div>
      {groups.map((group) => (
        <div key={group.category} className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            {t(`general.shortcutCategories.${group.category}`)}
          </p>
          {group.commands.map((command) => {
            const action = command.id;
            const actionLabel = t(`general.shortcutActions.${action}`);
            const isDefault = overrides[action] === undefined;
            return (
              <div key={action} className="flex items-center justify-between gap-3">
                <Label>{actionLabel}</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant={recording === action ? 'default' : 'outline'}
                    size="sm"
                    className="min-w-36 font-mono"
                    aria-label={t('general.shortcutRecordAria', { action: actionLabel })}
                    onClick={() => {
                      setNotice(null);
                      setRecording(action);
                    }}
                    title={t('general.shortcutRecord')}
                  >
                    {recording === action ? t('general.shortcutRecording') : formatBinding(resolved[action], isMac)}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    disabled={isDefault}
                    aria-label={t('general.shortcutResetOne', { action: actionLabel })}
                    title={t('general.shortcutResetOne', { action: actionLabel })}
                    onClick={() => {
                      setNotice(null);
                      setRecording(null);
                      resetBinding(action);
                    }}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {noticeText() !== null && (
        <p role="alert" className="text-xs text-destructive">
          {noticeText()}
        </p>
      )}
    </div>
  );
};

export default ShortcutRecorder;
