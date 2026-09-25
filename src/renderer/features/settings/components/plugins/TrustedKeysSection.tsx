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
import { requestAddTrustedPluginKey, requestRemoveTrustedPluginKey } from '@/shared/services/pluginService';
import { Button } from '@/shared/ui/Button';
import { Textarea } from '@/shared/ui/Textarea';

/**
 * 受信任签名公钥：主进程持清单（51 篇），这里逐把请求添加。
 * 每次保存主进程弹原生确认框，确认后返回最新清单刷新展示。
 */
const TrustedKeysSection: React.FC = () => {
  const { t } = useTranslation(['settings']);
  const [text, setText] = useState('');
  const [keys, setKeys] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void window.electronAPI?.pluginTrustedKeysList?.().then(setKeys).catch(() => undefined);
  }, []);

  const add = async (): Promise<void> => {
    const pem = text.trim();
    if (!pem.includes('BEGIN PUBLIC KEY')) {
      setNotice(t('plugins.trust.invalid'));
      return;
    }
    const ok = await requestAddTrustedPluginKey(pem);
    if (ok) {
      setText('');
      setKeys((await window.electronAPI?.pluginTrustedKeysList?.()) ?? []);
      setNotice(t('plugins.trust.added'));
    } else {
      setNotice(t('plugins.trust.rejected'));
    }
  };

  const remove = async (pem: string): Promise<void> => {
    const ok = await requestRemoveTrustedPluginKey(pem);
    if (ok) {
      setKeys((await window.electronAPI?.pluginTrustedKeysList?.()) ?? []);
      setNotice(null);
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 text-sm font-medium">{t('plugins.trust.title')}</div>
      <p className="mb-2 text-xs text-muted-foreground">{t('plugins.trust.hint')}</p>
      <div className="mb-1 text-xs font-medium">{t('plugins.trust.pasteLabel')}</div>
      <p className="mb-2 text-2xs text-muted-foreground">{t('plugins.trust.pasteHint')}</p>
      <Textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setNotice(null);
        }}
        rows={4}
        className="font-mono text-xs"
        placeholder="-----BEGIN PUBLIC KEY-----"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={() => void add()}>
          {t('plugins.trust.add')}
        </Button>
        {notice && <span className="text-xs text-muted-foreground">{notice}</span>}
      </div>
      <div className="mt-3 mb-1 text-xs font-medium">
        {t('plugins.trust.current')}（{keys.length}）
      </div>
      {keys.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('plugins.trust.none')}</p>
      ) : (
        <ul className="space-y-1">
          {keys.map((pem) => (
            <li key={pem} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
              <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">{pem.split('\n')[1] ?? pem}</span>
              <Button variant="ghost" size="sm" onClick={() => void remove(pem)}>
                {t('plugins.trust.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TrustedKeysSection;
