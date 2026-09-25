/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React, { useEffect, useState } from 'react';

import { useTranslation } from '@/i18n';
import { loadPluginNetworkHosts, savePluginNetworkHosts } from '@/shared/services/pluginService';
import { Button } from '@/shared/ui/Button';
import { Textarea } from '@/shared/ui/Textarea';

/** 受控网络门白名单：插件联网（搜索/翻译）只允许清单内域名，空清单即拒绝全部。 */
const NetworkGateSection: React.FC = () => {
  const { t } = useTranslation(['settings']);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadPluginNetworkHosts().then((hosts) => setText(hosts.join('\n')));
  }, []);

  const save = (): void => {
    const hosts = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    void savePluginNetworkHosts(hosts);
    setSaved(true);
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 text-sm font-medium">{t('plugins.net.title')}</div>
      <p className="mb-2 text-xs text-muted-foreground">{t('plugins.net.hint')}</p>
      <Textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(false);
        }}
        rows={3}
        className="font-mono text-xs"
        placeholder={'api.example.com\n*.example.org'}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={save}>
          {t('plugins.net.save')}
        </Button>
        {saved && <span className="text-xs text-muted-foreground">{t('plugins.net.saved')}</span>}
      </div>
    </div>
  );
};

export default NetworkGateSection;
