/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React, { useState } from 'react';

import { useTranslation } from '@/i18n';
import {
  readAllowAnyPluginSource,
  saveAllowAnyPluginSource,
  saveAllowedPluginSources,
} from '@/shared/services/pluginService';
import { Button } from '@/shared/ui/Button';
import { Switch } from '@/shared/ui/Switch';
import { Textarea } from '@/shared/ui/Textarea';

/** 插件来源白名单（manifest.source，每行一个）。空白名单即拒绝安装未认证来源，需显式开启"允许任意来源"。 */
const AllowedSourcesSection: React.FC = () => {
  const { t } = useTranslation(['settings']);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const [allowAny, setAllowAny] = useState(() => readAllowAnyPluginSource());
  const save = (): void => {
    const sources = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    saveAllowedPluginSources(sources);
    setSaved(true);
  };
  const toggleAllowAny = (checked: boolean): void => {
    setAllowAny(checked);
    saveAllowAnyPluginSource(checked);
  };
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 text-sm font-medium">{t('plugins.sources.title')}</div>
      <p className="mb-2 text-xs text-muted-foreground">{t('plugins.sources.hint')}</p>
      <Textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(false);
        }}
        rows={3}
        className="font-mono text-xs"
        placeholder="https://github.com/owner/plugin"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={save}>
          {t('plugins.sources.save')}
        </Button>
        {saved && <span className="text-xs text-muted-foreground">{t('plugins.sources.saved')}</span>}
      </div>
      <label className="mt-3 flex items-start gap-2">
        <Switch checked={allowAny} onCheckedChange={toggleAllowAny} aria-label={t('plugins.sources.allowAny')} />
        <span className="text-xs text-muted-foreground">
          <span className="text-foreground">{t('plugins.sources.allowAny')}</span>
          <br />
          {t('plugins.sources.allowAnyHint')}
        </span>
      </label>
    </div>
  );
};

export default AllowedSourcesSection;
