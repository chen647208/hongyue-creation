/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { X } from 'lucide-react';
import React from 'react';

import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';

import type { SettingsModalHeaderProps } from '../types';

const SettingsModalHeader: React.FC<SettingsModalHeaderProps> = ({ onClose }) => {
  const { t } = useTranslation(['settings', 'common']);
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
      <div>
        <h2 className="font-serif text-xl font-medium text-foreground">{t('title')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} title={t('common:close')} aria-label={t('common:close')}>
        <X className="size-4" />
      </Button>
    </div>
  );
};

export default SettingsModalHeader;
