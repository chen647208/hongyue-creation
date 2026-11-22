/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Search } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { useTranslation } from '@/i18n';
import type { AppCommand } from '@/shared/services/commandRegistry';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/Dialog';
import { Input } from '@/shared/ui/Input';
import { cn } from '@/shared/utils/cn';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: AppCommand[];
}

/** 命令面板（Ctrl/Cmd+K）：模糊过滤命令，回车执行首项。 */
const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onOpenChange, commands }) => {
  const { t } = useTranslation('app');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  /**
   * Esc 关闭：在窗口捕获阶段先处理。
   *
   * Radix 只把 Esc 交给它认定的最上层弹层，而面板刚挂载的一两帧里上层交接还没完成
   * （设置弹层页签切换后尤其明显），这一次按键会被下面的设置弹层接走，面板留在原地。
   * 窗口捕获早于 Radix 挂在 document 上的监听，保证 Esc 关闭面板、不误关下层。
   */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.title} ${c.keywords ?? ''}`.toLowerCase().includes(q));
  }, [commands, query]);

  const runAt = (index: number): void => {
    const cmd = filtered[index];
    if (!cmd) return;
    onOpenChange(false);
    cmd.run();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="w-[92vw] max-w-lg gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('commandPalette.title')}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder={t('commandPalette.placeholder')}
            className="border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); runAt(activeIndex); }
            }}
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t('commandPalette.empty')}</div>
          ) : (
            filtered.map((cmd, index) => (
              <button
                key={cmd.id}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runAt(index)}
                className={cn(
                  'flex w-full items-center rounded-md px-3 py-2 text-left text-sm',
                  index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50',
                )}
              >
                {cmd.title}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommandPalette;
