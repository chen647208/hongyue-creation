/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 插件状态面板（docs/design/04 §2）：状态汇总 + 错误详情 + 一键禁用/启用 + 安装/卸载 + 受控网络门 + 本地推理。 */
import { type AssemblyRow, assemblyTree, DEFAULT_RELEASE_PROFILE, type PluginCatalogEntry, type PluginHost, type PluginStatus,PROFILE_CHANGED_EVENT, profileByName, RELEASE_PROFILES } from '@core/plugin';
import { builtinRegistry } from '@core/types-registry';
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import type { LocalProbeResult, LocalRuntimeConfig, LocalRuntimeStatus, PluginInstallResult } from '@shared/types';
import React, { useEffect, useState } from 'react';

import { useSettingsStore } from '@/app/stores/settingsStore';
import { useTranslation } from '@/i18n';
import { assistantRuntime } from '@/shared/services/assistantRuntime';
import {
  decideInferenceTarget,
  getLocalInferenceConfig,
  getLocalRuntimeStatus,
  probeLocalInference,
  resetLocalInferenceProbeCache,
  setLocalInferenceConfig,
  startLocalRuntime,
  stopLocalRuntime,
} from '@/shared/services/localInferenceService';
import { localStore } from '@/shared/services/localStore';
import { connectServer, disconnectServer, fetchServerTools } from '@/shared/services/mcpClient';
import {
  installPluginFromDirectory,
  loadPluginNetworkHosts,
  readAllowAnyPluginSource,
  readPluginCatalog,
  saveAllowAnyPluginSource,
  saveAllowedPluginSources,
  savePluginNetworkHosts,
  saveTrustedPluginKeys,
  uninstallPlugin,
} from '@/shared/services/pluginService';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { LoadingState } from '@/shared/ui/LoadingState';
import { defaultFromSchema, type JsonSchemaObject, SchemaForm } from '@/shared/ui/SchemaForm';
import { Slot } from '@/shared/ui/Slot';
import { Spinner } from '@/shared/ui/Spinner';
import { Switch } from '@/shared/ui/Switch';
import { Textarea } from '@/shared/ui/Textarea';
import { APP_VERSION } from '@/shared/version';

import type { McpServerConfig } from '../../../../shared/types';
import UserSkillsCard from './UserSkillsCard';

/** 装配树实时视图：行随当前发行档即时重算，切换档位不用开关重看。 */
const AssemblyTreeView: React.FC<{ rows: AssemblyRow[] }> = ({ rows }) => (
  <div className="mt-2 overflow-x-auto rounded-lg border border-border p-3 font-mono text-xs">
    {rows.map((row) => (
      <div key={row.feature} className={row.enabled ? 'text-foreground' : 'text-muted-foreground'}>
        {row.enabled ? '✓' : '✗'} {row.feature} <span className="text-muted-foreground">← {row.source}{row.reason ? `（${row.reason}）` : ''}</span>
      </div>
    ))}
  </div>
);

/** 单插件设置：按 manifest.settingsSchema 渲染，值持久化在 plugin.<id>.settings。 */
const PluginSchemaSettings: React.FC<{ pluginId: string; schema: JsonSchemaObject }> = ({ pluginId, schema }) => {
  const { t } = useTranslation(['settings']);
  const key = `plugin.${pluginId}.settings`;
  const [state, setState] = useState<{ value: Record<string, unknown>; corrupt: boolean }>(() => {
    const raw = localStore.getItem(key);
    if (raw) {
      try {
        return { value: { ...defaultFromSchema(schema), ...(JSON.parse(raw) as Record<string, unknown>) }, corrupt: false };
      } catch {
        // 损坏配置：备份原值后回默认，不静默丢弃
        localStore.setItem(`${key}.corrupt`, raw);
        return { value: defaultFromSchema(schema), corrupt: true };
      }
    }
    return { value: defaultFromSchema(schema), corrupt: false };
  });
  const update = (next: Record<string, unknown>): void => {
    setState({ value: next, corrupt: false });
    localStore.setItem(key, JSON.stringify(next));
  };
  return (
    <div className="mt-2 rounded-md border border-border p-2">
      {state.corrupt && <p className="mb-2 text-xs text-warning">{t('plugins.settingsCorrupt')}</p>}
      <SchemaForm schema={schema} value={state.value} onChange={update} idPrefix={`plugin-${pluginId}`} />
    </div>
  );
};

/** 受信任签名公钥：PEM 列表（空行分隔），保存即生效。 */
const TrustedKeysSection: React.FC = () => {
  const { t } = useTranslation(['settings']);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const save = (): void => {
    const keys = text
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter((block) => block.includes('BEGIN PUBLIC KEY'));
    saveTrustedPluginKeys(keys);
    setSaved(true);
  };
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 text-sm font-medium">{t('plugins.trust.title')}</div>
      <p className="mb-2 text-xs text-muted-foreground">{t('plugins.trust.hint')}</p>
      <Textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(false);
        }}
        rows={4}
        className="font-mono text-xs"
        placeholder="-----BEGIN PUBLIC KEY-----"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={save}>
          {t('plugins.trust.save')}
        </Button>
        {saved && <span className="text-xs text-muted-foreground">{t('plugins.trust.saved')}</span>}
      </div>
    </div>
  );
};

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

/** 安装/更新/卸载：目录索引安装 + 本地目录安装；校验签名与来源后落盘。 */
const InstallSection: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { t } = useTranslation(['settings']);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [entries, setEntries] = useState<Array<{ entry: PluginCatalogEntry; baseDir: string }>>([]);

  const allowedSources = (): string[] => {
    try {
      const raw = localStore.getItem(STORAGE_KEYS.allowedPluginSources);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
    } catch {
      return [];
    }
  };

  const describe = (result: PluginInstallResult): string =>
    result.ok
      ? t('plugins.install.done', { id: result.pluginId, version: result.version, action: result.action })
      : t('plugins.install.failed', { reason: result.reason ?? '' });

  const installDir = async (sourceDir: string, expectedDigest?: string): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await installPluginFromDirectory({
        sourceDir,
        hostVersion: APP_VERSION,
        allowedSources: allowedSources(),
        allowAnySource: readAllowAnyPluginSource(),
        expectedDigest,
      });
      setMessage(describe(result));
      if (result.ok) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const pickFolder = async (): Promise<void> => {
    const api = window.electronAPI;
    if (!api) {
      setMessage(t('plugins.install.unavailable'));
      return;
    }
    const picked = await api.openDirectoryDialog({ title: t('plugins.install.pickFolder'), properties: ['openDirectory'] });
    const dir = picked.filePaths[0];
    if (picked.canceled || !dir) return;
    await installDir(dir);
  };

  const pickCatalog = async (): Promise<void> => {
    const api = window.electronAPI;
    if (!api) {
      setMessage(t('plugins.install.unavailable'));
      return;
    }
    const picked = await api.openFileDialog({ title: t('plugins.install.pickCatalog'), properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return;
    try {
      const parsed = await readPluginCatalog(file);
      if (!parsed.ok) {
        setMessage(t('plugins.install.catalogInvalid'));
        return;
      }
      const baseDir = file.replace(/[\\/][^\\/]*$/, '');
      setEntries(parsed.catalog.entries.map((entry) => ({ entry, baseDir })));
      setMessage(null);
    } catch {
      setMessage(t('plugins.install.catalogInvalid'));
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 text-sm font-medium">{t('plugins.install.title')}</div>
      <p className="mb-2 text-xs text-muted-foreground">{t('plugins.install.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void pickFolder()} disabled={busy}>
          {t('plugins.install.fromFolder')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void pickCatalog()} disabled={busy}>
          {t('plugins.install.fromCatalog')}
        </Button>
        {busy && <Spinner className="size-4" />}
      </div>
      {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
      {entries.length > 0 && (
        <div className="mt-3 space-y-2">
          {entries.map(({ entry, baseDir }) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{entry.name} <span className="text-muted-foreground">{entry.version}</span></div>
                <div className="truncate font-mono text-2xs text-muted-foreground">{entry.id} · {entry.source}</div>
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void installDir(`${baseDir}/${entry.path}`.replace(/\/+/g, '/'), entry.digest)}
              >
                {t('plugins.install.action')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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

/** 本地推理接入：启用 + 端点 + 模型探测；关闭或不可达即回落远程网关。 */
const LocalInferenceSection: React.FC = () => {
  const { t } = useTranslation(['settings']);
  const [config, setConfig] = useState<LocalRuntimeConfig>({ enabled: false, endpoint: '' });
  const [status, setStatus] = useState<LocalRuntimeStatus>({ running: false });
  const [probe, setProbe] = useState<LocalProbeResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setConfig(await getLocalInferenceConfig());
      setStatus(await getLocalRuntimeStatus());
    })();
  }, []);

  const persist = async (next: LocalRuntimeConfig): Promise<void> => {
    setConfig(next);
    // 配置变化即失效探测缓存，生成路径的下一次路由按新配置判定
    resetLocalInferenceProbeCache();
    await setLocalInferenceConfig(next);
  };

  const runProbe = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await probeLocalInference();
      setProbe(result);
      resetLocalInferenceProbeCache();
      setStatus(await getLocalRuntimeStatus());
    } finally {
      setBusy(false);
    }
  };

  const target = decideInferenceTarget(config, probe?.reachable === true);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t('plugins.local.title')}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('plugins.local.enabled')}</span>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => void persist({ ...config, enabled: checked })}
            aria-label={t('plugins.local.enabled')}
          />
        </div>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{t('plugins.local.hint')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={config.endpoint}
          onChange={(event) => void persist({ ...config, endpoint: event.target.value })}
          placeholder="http://127.0.0.1:11434"
          className="h-8 flex-1 font-mono text-xs"
          aria-label={t('plugins.local.endpoint')}
        />
        <Button size="sm" variant="outline" onClick={() => void runProbe()} disabled={busy || !config.enabled}>
          {busy ? <Spinner className="size-3.5" /> : t('plugins.local.probe')}
        </Button>
        {status.running ? (
          <Button size="sm" variant="outline" onClick={() => void stopLocalRuntime().then(() => setStatus({ running: false }))}>
            {t('plugins.local.stop')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void startLocalRuntime().then(setStatus)} disabled={!config.enabled}>
            {t('plugins.local.start')}
          </Button>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          value={config.command ?? ''}
          onChange={(event) => void persist({ ...config, command: event.target.value.trim() || undefined })}
          placeholder={t('plugins.local.commandPlaceholder')}
          className="h-8 flex-1 font-mono text-xs"
          aria-label={t('plugins.local.command')}
        />
        <Input
          value={(config.args ?? []).join(' ')}
          onChange={(event) =>
            void persist({
              ...config,
              args: event.target.value.trim() ? event.target.value.trim().split(/\s+/) : undefined,
            })
          }
          placeholder={t('plugins.local.argsPlaceholder')}
          className="h-8 flex-1 font-mono text-xs"
          aria-label={t('plugins.local.args')}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('plugins.local.commandHint')}</p>
      {probe && (
        <p className="mt-2 text-xs text-muted-foreground">
          {probe.reachable
            ? t('plugins.local.reachable', { count: probe.models.length, endpoint: probe.endpoint })
            : t('plugins.local.unreachable', { error: probe.error ?? '' })}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {target.kind === 'local' ? t('plugins.local.routeLocal') : t('plugins.local.routeRemote', { reason: target.reason })}
      </p>
      {probe?.reachable && probe.models.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {probe.models.slice(0, 30).map((model) => (
            <button
              key={model.id}
              type="button"
              aria-pressed={config.model === model.id}
              onClick={() => void persist({ ...config, model: model.id })}
              className={`rounded-full border px-2 py-0.5 text-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
                config.model === model.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted'
              }`}
            >
              {model.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

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

/** MCP 外部服务：stdio 命令管理 + 连通测试 + 启用开关（工具以 mcp.* 进注册表）。 */
const McpServersSection: React.FC = () => {
  const { t } = useTranslation(['settings', 'common']);
  const servers = useSettingsStore((s) => s.mcpServers ?? []);
  const setMcpServers = useSettingsStore((s) => s.setMcpServers);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const save = (next: McpServerConfig[]): void => {
    setMcpServers(next);
  };

  const addServer = (): void => {
    const cleanName = name.trim();
    const cleanCommand = command.trim();
    if (!cleanName || !cleanCommand) return;
    const id = `mcp-${Date.now().toString(36)}`;
    save([...servers, { id, name: cleanName, command: cleanCommand, args: [], enabled: false }]);
    setName('');
    setCommand('');
  };

  const testServer = async (server: McpServerConfig): Promise<void> => {
    setTestingId(server.id);
    setTestResult(null);
    try {
      await connectServer(server);
      const tools = await fetchServerTools(server);
      setTestResult(t('plugins.mcp.testOk', { count: tools.length }));
    } catch (err) {
      setTestResult(t('plugins.mcp.testFailed', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="text-base font-medium">{t('plugins.mcp.title')}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t('plugins.mcp.hint')}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('plugins.mcp.namePlaceholder')}
          className="h-8 flex-1 text-xs"
        />
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={t('plugins.mcp.commandPlaceholder')}
          className="h-8 flex-[2] font-mono text-xs"
        />
        <Button size="sm" onClick={addServer} disabled={!name.trim() || !command.trim()}>
          {t('plugins.mcp.add')}
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {servers.length === 0 && (
          <p className="text-xs italic text-muted-foreground">{t('plugins.mcp.empty')}</p>
        )}
        {servers.map((server) => (
          <div key={server.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">{server.name}</span>
                <Badge variant={server.enabled ? 'default' : 'secondary'}>
                  {server.enabled ? t('plugins.mcp.enabled') : t('plugins.mcp.disabled')}
                </Badge>
              </div>
              <div className="mt-0.5 truncate font-mono text-2xs text-muted-foreground">{server.command}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={testingId === server.id}
                onClick={() => void testServer(server)}
              >
                {testingId === server.id ? <Spinner className="size-3.5" /> : t('plugins.mcp.test')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => save(servers.map((s) => (s.id === server.id ? { ...s, enabled: !s.enabled } : s)))}
              >
                {server.enabled ? t('plugins.disable') : t('plugins.enable')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  void disconnectServer(server.id).catch(() => {});
                  save(servers.filter((s) => s.id !== server.id));
                }}
              >
                {t('common:delete')}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {testResult && <p className="mt-2 text-xs text-muted-foreground">{testResult}</p>}
    </div>
  );
};

export default PluginSettingsPanel;
