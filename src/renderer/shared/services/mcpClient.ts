/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * MCP 客户端服务（docs/design/14）：外部 server 的连接管理 +
 * 工具合并进 ToolRegistry（`mcp.<serverId>.<tool>` 命名空间）。
 * 权限默认 write:proposal（走审批）；readOnlyHint 显式只读才直通。
 */
import type { ToolPermission, ToolRegistry } from '@core/ai';
import type { McpServerConfig } from '@shared/types';

export interface McpRemoteTool {
  serverId: string;
  toolId: string;
  name: string;
  description: string;
  /** 远端 inputSchema（JSON Schema）；缺失或非对象类型时退化为空对象 schema。 */
  parameters: Record<string, unknown>;
  /** 服务端声明只读：注册为 read 权限，直通不走审批。 */
  readOnly: boolean;
  /** 服务端声明为提案工具（`_meta['hongyue/proposal']`）：调用只入待审箱，不直接落库。 */
  proposal: boolean;
}

/**
 * 远端工具权限判定：
 * - readOnly：直通（read）。
 * - 内置 server 的提案工具：调用仅写入统一待审箱（pending-proposals.jsonl），
 *   真实落库由用户在待审箱批准，故不再套一层 broker 弹批（避免双重审批）。
 *   外部 server 的 `_meta` 不可信，一律按可写走审批，禁旁路。
 * - 其余：write:proposal（弹批，批准后执行）。
 */
export function remoteToolPermission(
  serverId: string,
  tool: Pick<McpRemoteTool, 'readOnly' | 'proposal'>,
): ToolPermission {
  if (tool.readOnly) return 'read';
  if (tool.proposal && serverId === 'builtin') return 'read';
  return 'write:proposal';
}

/** 取远端 inputSchema（须为 object 类型），否则回退空对象 schema。 */
function remoteParameters(inputSchema: unknown): Record<string, unknown> {
  if (
    inputSchema &&
    typeof inputSchema === 'object' &&
    !Array.isArray(inputSchema) &&
    (inputSchema as { type?: unknown }).type === 'object'
  ) {
    return inputSchema as Record<string, unknown>;
  }
  return { type: 'object', properties: {} };
}

function api() {
  const gateway = window.electronAPI?.mcpClient;
  if (!gateway) throw new Error('MCP 客户端需要 Electron 环境');
  return gateway;
}

/** 工具 id 命名空间化（serverId 与工具名中的点转下划线防歧义）。 */
export function mcpToolId(serverId: string, toolName: string): string {
  const safe = (s: string): string => s.replace(/\./g, '_');
  return `mcp.${safe(serverId)}.${safe(toolName)}`;
}

export async function connectServer(server: McpServerConfig): Promise<void> {
  await api().connect(server.id, server.command, server.args ?? []);
}

export async function disconnectServer(id: string): Promise<void> {
  await api().disconnect(id).catch(() => {});
}

export async function fetchServerTools(server: McpServerConfig): Promise<McpRemoteTool[]> {
  const { tools } = await api().tools(server.id);
  return (tools ?? []).map((t) => ({
    serverId: server.id,
    toolId: mcpToolId(server.id, t.name),
    name: t.name,
    description: t.description ?? '',
    parameters: remoteParameters(t.inputSchema),
    readOnly: t.annotations?.readOnlyHint === true,
    proposal: t._meta?.['hongyue/proposal'] === true,
  }));
}

/**
 * 同步启用 server 的工具进注册表：先取远端清单，再同帧刷新本地注册
 * （注册与摘除之间无 await，并发会话不会遇到工具瞬时空窗）。
 * 拉取失败的 server 保留上一轮注册，不清空。执行经 IPC 透传；
 * 取消信号不跨进程（以会话中止为准，调用级 signal 忽略）。
 */
export async function syncMcpTools(
  registry: ToolRegistry,
  servers: McpServerConfig[],
): Promise<{ added: number; errors: string[] }> {
  let added = 0;
  const errors: string[] = [];
  for (const server of servers) {
    if (!server.enabled) continue;
    let remote: McpRemoteTool[];
    try {
      await connectServer(server);
      remote = await fetchServerTools(server);
    } catch (err) {
      errors.push(`${server.name}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const prefix = `mcp.${server.id.replace(/\./g, '_')}.`;
    const keep = new Set<string>();
    for (const tool of remote) {
      keep.add(tool.toolId);
      if (registry.has(tool.toolId)) continue;
      try {
        registry.register({
          id: tool.toolId,
          description: tool.description || tool.name,
          parameters: tool.parameters,
          permission: remoteToolPermission(server.id, tool),
          execute: async (req) => {
            try {
              const data = await api().call(tool.serverId, tool.name, req.args ?? {});
              return { ok: true, data };
            } catch (err) {
              return { ok: false, error: err instanceof Error ? err.message : String(err) };
            }
          },
        });
        added += 1;
      } catch (err) {
        errors.push(`${tool.toolId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // 移除本 server 已下线的工具（同步段，与注册同帧完成）
    for (const existing of registry.list()) {
      if (existing.id.startsWith(prefix) && !keep.has(existing.id)) registry.unregister(existing.id);
    }
  }
  return { added, errors };
}
