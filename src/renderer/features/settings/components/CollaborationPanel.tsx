/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 协作面板：开启同机多窗口实时协作，显示当前房间。 */
import { Users } from 'lucide-react';
import React from 'react';

import { getCollaborationSession, useCollaborationStore } from '@/app/collaboration/collaborationService';
import { useProjectStore } from '@/app/stores/projectStore';
import { useTranslation } from '@/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/Card';
import { Input } from '@/shared/ui/Input';
import { Switch } from '@/shared/ui/Switch';

const CollaborationPanel: React.FC = () => {
  const { t } = useTranslation('settings');
  const enabled = useCollaborationStore((state) => state.enabled);
  const peers = useCollaborationStore((state) => state.peers);
  const sessionState = useCollaborationStore((state) => state.sessionState);
  const serverUrl = useCollaborationStore((state) => state.serverUrl);
  const setServerUrl = useCollaborationStore((state) => state.setServerUrl);
  const setEnabled = useCollaborationStore((state) => state.setEnabled);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  let status = t('collab.inactive');
  if (enabled) {
    if (sessionState === 'ready') status = t('collab.active', { room: getCollaborationSession()?.room ?? '' });
    else if (sessionState === 'handshaking') status = t('collab.handshaking');
    else status = t('collab.waiting');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          {t('collab.title')}
        </CardTitle>
        <CardDescription>{t('collab.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm">{t('collab.enable')}</span>
          <Switch aria-label={t('collab.enable')} checked={enabled} disabled={!activeProjectId} onCheckedChange={setEnabled} />
        </div>
        <p className="text-xs text-muted-foreground">{status}</p>
        {typeof window !== 'undefined' && window.electronAPI?.collab && (
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{t('collab.serverLabel')}</span>
            <Input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="ws://host:1234" className="h-8 text-xs" />
            <p className="text-2xs text-muted-foreground">{t('collab.serverHint')}</p>
          </div>
        )}
        {enabled && peers.length > 0 && (
          <div className="space-y-1">
            <span className="text-2xs text-muted-foreground">{t('collab.online', { count: peers.length })}</span>
            <div className="flex flex-wrap gap-1">
              {peers.map((peer) => (
                <span key={peer.id} className="rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground">
                  {peer.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CollaborationPanel;
