/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { McpServerConfig } from '@shared/types';
import React, { useState } from 'react';

import { useSettingsStore } from '@/app/stores/settingsStore';
import { useTranslation } from '@/i18n';
import { connectServer, disconnectServer, fetchServerTools } from '@/shared/services/mcpClient';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Spinner } from '@/shared/ui/Spinner';

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

export default McpServersSection;
