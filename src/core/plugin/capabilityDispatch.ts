/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 能力派发（docs/design/49 §2）：把脚本/渲染器返回的能力调用按白名单派发到宿主契约。
 *
 * 白名单 = 描述符 `capabilities` ∩ manifest 权限（由 `resolveCapabilities` 得出，见
 * `ToolProposalRequest.capabilities`）。未声明的能力名不可见、越权调用一律拒绝。
 * read 直通；write 走审批（write:proposal 弹批）；net/ai 结果经 `fence` 围栏后回给调用方。
 * 本层纯逻辑，不触达数据：审批与执行由注入的适配器承担，缺省即拒绝（fail-closed）。
 */

import type {
  CapabilityMap,
  ToolCallResult,
  ToolProposalPort,
  ToolProposalRequest,
} from './execution.js';
import type { SandboxToolCall } from './sandbox/types.js';

/** 审批档位：read 直通，write 走提案弹批；write:direct 由适配器记录审计。 */
export type CapabilityCallPermission = 'read' | 'write:proposal' | 'write:direct';

/** 审批提案摘要：脚本拿不到写入，只能提交可读提案给人审。 */
export interface CapabilityProposalSummary {
  title: string;
  summary?: string;
  suggestion?: string;
}

export interface CapabilityAuthorizeRequest {
  callId: string;
  toolId: string;
  proposal?: CapabilityProposalSummary;
}

export interface CapabilityAuthorizeResult {
  allowed: boolean;
  reason?: string;
}

export type CapabilityExecuteResult = { ok: true; text: string } | { ok: false; reason: string };

/**
 * 宿主适配器：能力名到既有宿主契约的受控映射。
 * `authorize` 接审批路由，`execute` 接读写/网络/AI 契约，`fence` 接不可信围栏。
 */
export interface CapabilityDispatchAdapters {
  authorize(
    permission: CapabilityCallPermission,
    request: CapabilityAuthorizeRequest,
  ): Promise<CapabilityAuthorizeResult>;
  execute(
    call: SandboxToolCall,
    context: { pluginId: string; scriptId: string; callId: string },
  ): Promise<CapabilityExecuteResult>;
  fence(text: string, origin: string): string;
}

export interface ParsedCapabilityTool {
  kind: 'read' | 'write' | 'net' | 'ai' | 'unknown';
  domain?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 解析能力调用名（`read:<域>` / `write:<域>` / `net` / `ai`）；白名单外一律 unknown。 */
export function parseCapabilityTool(tool: string): ParsedCapabilityTool {
  const index = tool.indexOf(':');
  if (index === -1) {
    if (tool === 'net' || tool === 'ai') return { kind: tool };
    return { kind: 'unknown' };
  }
  const kind = tool.slice(0, index);
  const domain = tool.slice(index + 1);
  if ((kind === 'read' || kind === 'write') && domain) return { kind, domain };
  return { kind: 'unknown' };
}

/** 调用是否落在描述符声明的能力映射内；未声明不可见。 */
export function isCapabilityDeclared(tool: ParsedCapabilityTool, map: CapabilityMap): boolean {
  switch (tool.kind) {
    case 'read':
      return tool.domain !== undefined && map.read.includes(tool.domain);
    case 'write':
      return tool.domain !== undefined && map.write.includes(tool.domain);
    case 'net':
      return map.net;
    case 'ai':
      return map.ai;
    default:
      return false;
  }
}

function buildProposal(call: SandboxToolCall): CapabilityProposalSummary {
  const args = isRecord(call.args) ? call.args : {};
  const title = typeof args.title === 'string' && args.title ? args.title : call.tool;
  const suggestion =
    typeof args.body === 'string'
      ? args.body
      : typeof args.suggestion === 'string'
        ? args.suggestion
        : typeof args.content === 'string'
          ? args.content
          : undefined;
  return { title, summary: `插件提议调用 ${call.tool}`, suggestion };
}

/**
 * 构造生产工具提议端口：逐条按白名单派发。
 *
 * 任一条越权或执行失败即整体失败（fail-closed）；成功条目带围栏后的回执文本。
 */
export function createCapabilityDispatchPort(adapters: CapabilityDispatchAdapters): ToolProposalPort {
  return async (request: ToolProposalRequest) => {
    const results: ToolCallResult[] = [];
    const failures: string[] = [];
    let seq = 0;
    for (const call of request.proposals) {
      seq += 1;
      const callId = `${request.scriptId}#${seq}`;
      const parsed = parseCapabilityTool(call.tool);
      if (!isCapabilityDeclared(parsed, request.capabilities)) {
        failures.push(`${call.tool} 未在描述符能力白名单中声明`);
        continue;
      }
      const permission: CapabilityCallPermission = parsed.kind === 'write' ? 'write:proposal' : 'read';
      const decision = await adapters.authorize(permission, {
        callId,
        toolId: call.tool,
        proposal: permission === 'write:proposal' ? buildProposal(call) : undefined,
      });
      if (!decision.allowed) {
        failures.push(decision.reason ?? `${call.tool} 未获审批放行`);
        continue;
      }
      const executed = await adapters.execute(call, {
        pluginId: request.pluginId,
        scriptId: request.scriptId,
        callId,
      });
      if (!executed.ok) {
        failures.push(`${call.tool}: ${executed.reason}`);
        continue;
      }
      const external = parsed.kind === 'net' || parsed.kind === 'ai';
      results.push({
        tool: call.tool,
        text: external ? adapters.fence(executed.text, `plugin:${request.pluginId}/${call.tool}`) : executed.text,
      });
    }
    if (failures.length) {
      return { ok: false, error: { kind: 'capability', message: failures.join('; ') } };
    }
    return { ok: true, accepted: results.length, results };
  };
}
