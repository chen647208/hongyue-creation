/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 插件状态面板（docs/design/04 §2）：状态汇总 + 错误详情 + 一键禁用/启用 + 安装/卸载 + 受控网络门 + 本地推理。 */
import {
  assemblyTree,
  DEFAULT_RELEASE_PROFILE,
  type PluginHost,
  type PluginStatus,
  PROFILE_CHANGED_EVENT,
  profileByName,
  RELEASE_PROFILES,
} from '@core/plugin';
import { builtinRegistry } from '@core/types-registry';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import React, { useEffect, useState } from 'react';

import { useTranslation } from '@/i18n';
import { assistantRuntime } from '@/shared/services/assistantRuntime';
import { localStore } from '@/shared/services/localStore';
import { uninstallPlugin } from '@/shared/services/pluginService';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { LoadingState } from '@/shared/ui/LoadingState';
import type { JsonSchemaObject } from '@/shared/ui/SchemaForm';
import { Slot } from '@/shared/ui/Slot';

import AllowedSourcesSection from './plugins/AllowedSourcesSection';
import AssemblyTreeView from './plugins/AssemblyTreeView';
import InstallSection from './plugins/InstallSection';
import LocalInferenceSection from './plugins/LocalInferenceSection';
import McpServersSection from './plugins/McpServersSection';
import NetworkGateSection from './plugins/NetworkGateSection';
import PluginSchemaSettings from './plugins/PluginSchemaSettings';
import TrustedKeysSection from './plugins/TrustedKeysSection';
import UserSkillsCard from './UserSkillsCard';

const PluginSettingsPanel: React.FC = () => {
  const { t } = useTranslation(['settings', 'common']);
  const [statuses, setStatuses] = useState<PluginStatus[] | null>(null);
  const [manifests, setManifests] = useState<Record<string, unknown>>({});
  const [showTree, setShowTree] = useState(false);
  const [profile, setProfile] = useState<string>(() => localStore.getItem(STORAGE_KEYS.profileCurrent) ?? DEFAULT_RELEASE_PROFILE);
  const registeredTypes = builtinRegistry.list();

  const loadFromHost = React.useCallback((host: PluginHost): void => {
    setStatuses(host.list());
    const schemaMap: Record<string, unknown> = {};
    for (const status of host.list()) {
      const schema = host.manifest(status.id)?.settingsSchema;
      if (schema) schemaMap[status.id] = schema;
    }
    setManifests(schemaMap);
  }, []);

  useEffect(() => {
    let alive = true;
    const runtime = assistantRuntime();
    if (!runtime) return () => { alive = false; };
    void runtime.pluginHostPromise.then((host) => {
      if (alive) loadFromHost(host);
    });
    return () => {
      alive = false;
    };
  }, [loadFromHost]);

  /** 安装/卸载后重建宿主并刷新面板（释放旧贡献 + 重新发现）。 */
  const refresh = (): void => {
    const runtime = assistantRuntime();
    if (!runtime) return;
    void runtime.reloadPlugins().then(loadFromHost);
  };

  const remove = (id: string): void => {
    const runtime = assistantRuntime();
    if (!runtime) return;
    void runtime.pluginHostPromise.then(async (host) => {
      await uninstallPlugin(host, id);
      refresh();
    });
  };

  const applyProfile = (name: string): void => {
    setProfile(name);
    localStore.setItem(STORAGE_KEYS.profileCurrent, name);
    window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT));
    // AI 拦截由 aiRuntime 的 aiGate 按档位实时生效（覆盖所有网关出口），此处只改档位。
  };

  const toggle = (id: string, disabled: boolean): void => {
    const runtime = assistantRuntime();
    if (!runtime) return;
    void runtime.pluginHostPromise.then((host) => {
      if (disabled) {
        host.enable(id);
        host.activate(id);
      } else {
        host.disable(id);
      }
      runtime.saveDisabledList(host.list().filter((st) => st.state === 'disabled').map((st) => st.id));
      setStatuses(host.list());
    });
  };

  if (statuses === null) {
    return <LoadingState className="py-16" />;
  }

  const failed = statuses.filter((s) => s.state === 'failed').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-base font-medium">{t('plugins.title')}</h3>
        <Badge variant="secondary">{statuses.length}</Badge>
        {failed > 0 && <Badge variant="destructive">{t('plugins.failedCount', { count: failed })}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{t('plugins.description')}</p>

      <UserSkillsCard />

      <InstallSection onChanged={refresh} />

      <TrustedKeysSection />

      <AllowedSourcesSection />

      <NetworkGateSection />

      <div className="rounded-lg border border-border p-3">
        <div className="mb-2 text-sm font-medium">{t('plugins.panel.title')}</div>
        <Slot id="plugin.panel" />
      </div>

      <div>
        <div className="mb-1 text-sm font-medium">{t('plugins.profile.title')}</div>
        <div className="flex flex-wrap gap-2">
          {RELEASE_PROFILES.map(({ name }) => (
            <Button
              key={name}
              size="sm"
              variant={profile === name ? 'default' : 'outline'}
              onClick={() => applyProfile(name)}
            >
              {t(`plugins.profile.${name}`)}
            </Button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t('plugins.profile.hint')}</p>
      </div>

      <div>
          <Button size="sm" variant="outline" onClick={() => setShowTree((v) => !v)}>
            {showTree ? t('plugins.tree.hide') : t('plugins.tree.show')}
          </Button>
          {showTree && <AssemblyTreeView rows={assemblyTree(profileByName(profile))} />}
      </div>

      {/* 类型注册表（只读）：内置 + 插件贡献的类型模板，供排查"新文体是否已装载" */}
      <div className="rounded-lg border border-border p-3">
        <div className="mb-2 text-sm font-medium">{t('plugins.types.title', { count: registeredTypes.length })}</div>
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {registeredTypes.map((tpl) => (
            <Badge key={tpl.id} variant="outline" className="rounded-full text-2xs font-normal" title={tpl.id}>
              {tpl.label}
            </Badge>
          ))}
        </div>
      </div>

      {!statuses.length && <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">{t('plugins.empty')}</div>}

      <div className="space-y-2">
        {statuses.map((s) => (
          <div key={s.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{s.id}</span>
                  <Badge variant={s.state === 'active' ? 'default' : s.state === 'failed' ? 'destructive' : 'secondary'}>
                    {t(`plugins.state.${s.state}`)}
                  </Badge>
                </div>
                {s.error && <div className="mt-1 text-xs text-destructive">{s.error.phase}: {s.error.message}</div>}
                {s.error && s.error.cause.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">cause: {s.error.cause.join(' ← ')}</div>
                )}
                {manifests[s.id] ? (
                  <PluginSchemaSettings pluginId={s.id} schema={manifests[s.id] as JsonSchemaObject} />
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {s.state === 'disabled' ? (
                  <Button size="sm" variant="outline" onClick={() => toggle(s.id, true)}>
                    {t('plugins.enable')}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => toggle(s.id, false)}>
                    {t('plugins.disable')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remove(s.id)}
                >
                  {t('plugins.uninstall')}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <LocalInferenceSection />

      <McpServersSection />
    </div>
  );
};

export default PluginSettingsPanel;
