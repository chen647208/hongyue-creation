/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 能力派发的生产适配器（docs/design/49 §2）。
 *
 * 把白名单内的能力调用映射到既有宿主契约：
 *   - `read:<域>` → 既有 `repository` 查询（全文检索 / 全量状态投影）；
 *   - `write:<域>` → 既有提案执行器 `executeMcpProposal`，放行判定走 `ApprovalRouter`（弹批）；
 *   - `net` → 主进程受控网络门 `pluginNet`（netGate，默认拒绝、白名单）；
 *   - `ai` → 既有 AI 网关客户端（受 aiGate 配额与发行档约束）。
 *
 * 宿主契约（审批 broker、提案执行器、当前模型）由应用层装配处注入（`CapabilityHostBindings`）：
 * 本模块不反向 import 助手层，注入项缺席即对应能力 fail-closed。
 * 结果文本经 `fenceUntrusted` 围栏后回给调用方；本模块不提供任何裸 fetch/fs/eval。
 */

import { type ApprovalBroker, ApprovalRouter, fenceUntrusted, type McpProposalExec } from '@core/ai';
import {
  type CapabilityDispatchAdapters,
  createCapabilityDispatchPort,
  parseCapabilityTool,
  type ToolProposalPort,
} from '@core/plugin';
import { PLUGIN_SCRIPT_MAX_OUTPUT_BYTES } from '@shared/constants/pluginExecution';
import type { AppState, ModelConfig } from '@shared/types';

import { logger } from '../utils/logger';

type ExecuteResult = { ok: true; text: string } | { ok: false; reason: string };

/** 提案执行结果：与助手层执行器返回结构一致，共享层不引用助手层类型。 */
export interface ProposalExecutionResult {
  ok: boolean;
  applied?: string;
  error?: string;
}

/**
 * 宿主绑定：应用层装配处注入助手层契约，共享层不反向依赖助手层。
 * 任一项缺席即对应能力 fail-closed（审批拒绝 / 写入拒绝 / AI 拒绝）。
 */
export interface CapabilityHostBindings {
  /** 审批代理（助手层单例）：write:proposal 复用既有审批浮层。 */
  broker?: ApprovalBroker;
  /** 写入提案执行器：审批通过后落库。 */
  executeProposal?: (exec: McpProposalExec, proposalId: string) => Promise<ProposalExecutionResult>;
  /** 当前生效模型读取器：AI 能力据此选模型；缺省拒绝。 */
  activeModel?: () => ModelConfig | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** 输出截断：超上限即截断并标注（能力回执不阻塞脚本）。 */
function boundText(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes <= PLUGIN_SCRIPT_MAX_OUTPUT_BYTES) return text;
  return `${text.slice(0, PLUGIN_SCRIPT_MAX_OUTPUT_BYTES)}\n[回执已截断…]`;
}

// ── 审批路由（broker 由应用层注入；未注入即拒绝）──────────────────────

function createRouter(broker: ApprovalBroker | undefined): ApprovalRouter | undefined {
  if (!broker) return undefined;
  return new ApprovalRouter(broker, (callId, toolId) => {
    // write:direct 审计：插件写入不落直接写路径，这里只留审计日志。
    logger.info(`[plugin] write:direct 生效审计 callId=${callId} toolId=${toolId}`);
  });
}

// ── read：既有 repository 查询服务 ───────────────────────────────────

function summarizeState(state: AppState, domain: string): unknown {
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(state));
  const direct = record[domain];
  if (Array.isArray(direct)) {
    return { domain, count: direct.length, items: direct.slice(0, 20) };
  }
  const projects = state.projects ?? [];
  return {
    domain,
    count: projects.length,
    projects: projects.slice(0, 10).map((p) => ({
      id: p.id,
      title: p.title,
      chapters: (p.chapters ?? []).length,
      knowledge: (p.knowledge ?? []).length,
    })),
  };
}

async function readCapability(domain: string, args: unknown): Promise<ExecuteResult> {
  try {
    const { repository } = await import('@/shared/services/repository/index.js');
    const record = isRecord(args) ? args : {};
    const query = typeof args === 'string' ? args : asString(record.query);
    const limit = clampLimit(record.limit, 20, 50);
    if (query) {
      const hits = await repository.search(query, { limit });
      return {
        ok: true,
        text: boundText(JSON.stringify({ domain, query, hits: hits.map((h) => ({ scope: h.scope, title: h.title, snippet: h.snippet })) })),
      };
    }
    const state = await repository.loadAll();
    if (!state) return { ok: true, text: JSON.stringify({ domain, empty: true }) };
    return { ok: true, text: boundText(JSON.stringify(summarizeState(state, domain))) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// ── write：既有提案执行器（审批在派发层先行）──────────────────────────

async function writeCapability(
  domain: string,
  args: unknown,
  context: { pluginId: string; scriptId: string },
  executeProposal: CapabilityHostBindings['executeProposal'],
): Promise<ExecuteResult> {
  const record = isRecord(args) ? args : {};
  const body = asString(record.body) ?? asString(record.content);
  if (!body) return { ok: false, reason: '写入提议缺少 body 文本' };
  if (!executeProposal) return { ok: false, reason: '提案执行器未注入，拒绝写入' };
  const exec: McpProposalExec = {
    kind: record.kind === 'chapter-write' ? 'chapter-write' : 'card-write',
    bookId: asString(record.bookId),
    nodeId: asString(record.nodeId),
    type: asString(record.type) ?? domain.replace(/^card:/, ''),
    title: asString(record.title) ?? `${domain} 写入`,
    body,
  };
  try {
    const result = await executeProposal(exec, `plugin:${context.pluginId}/${context.scriptId}`);
    if (!result.ok) return { ok: false, reason: result.error ?? '提案执行失败' };
    return { ok: true, text: result.applied ?? '提案已应用' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// ── net：主进程受控网络门 ────────────────────────────────────────────

async function netCapability(args: unknown): Promise<ExecuteResult> {
  const api = typeof window === 'undefined' ? undefined : window.electronAPI;
  if (!api?.pluginNet) return { ok: false, reason: '当前环境不支持受控网络门' };
  const record = isRecord(args) ? args : {};
  const url = typeof args === 'string' ? args : asString(record.url);
  if (!url) return { ok: false, reason: '网络能力缺少 url' };
  const headers = isRecord(record.headers)
    ? Object.fromEntries(Object.entries(record.headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : undefined;
  try {
    const result = await api.pluginNet.fetch({
      url,
      method: asString(record.method),
      headers,
      body: asString(record.body),
    });
    if (!result.ok) return { ok: false, reason: result.error ?? '网络请求失败' };
    return { ok: true, text: result.text ?? '' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// ── ai：既有 AI 网关 ────────────────────────────────────────────────

async function aiCapability(args: unknown, activeModel: CapabilityHostBindings['activeModel']): Promise<ExecuteResult> {
  const record = isRecord(args) ? args : {};
  const prompt = typeof args === 'string' ? args : (asString(record.prompt) ?? asString(record.text));
  if (!prompt) return { ok: false, reason: 'AI 能力缺少 prompt' };
  if (!activeModel) return { ok: false, reason: 'AI 模型读取器未注入，拒绝 AI 能力' };
  try {
    const [{ gatewayComplete }, { resolveEffectiveModel }] = await Promise.all([
      import('@/shared/services/ai/gatewayClient'),
      import('@/shared/services/localInferenceService'),
    ]);
    const active = activeModel();
    if (!active) return { ok: false, reason: '未配置模型，拒绝 AI 能力' };
    const model = (await resolveEffectiveModel(active)) ?? active;
    const response = await gatewayComplete(model, prompt, { feature: 'plugin' });
    if (response.error) return { ok: false, reason: response.error };
    return { ok: true, text: response.content ?? '' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** 生产执行适配器：按能力名派发到既有宿主契约；未知能力一律拒绝。 */
async function executeCapability(
  call: { tool: string; args: unknown },
  context: { pluginId: string; scriptId: string },
  bindings: CapabilityHostBindings,
): Promise<ExecuteResult> {
  const parsed = parseCapabilityTool(call.tool);
  switch (parsed.kind) {
    case 'read':
      return readCapability(parsed.domain ?? '', call.args);
    case 'write':
      return writeCapability(parsed.domain ?? '', call.args, context, bindings.executeProposal);
    case 'net':
      return netCapability(call.args);
    case 'ai':
      return aiCapability(call.args, bindings.activeModel);
    default:
      return { ok: false, reason: `未知能力：${call.tool}` };
  }
}

/** 生产适配器集合；宿主契约由应用层注入，测试可注入替身覆盖部分实现。 */
export function createPluginCapabilityAdapters(
  bindings: CapabilityHostBindings = {},
  overrides: Partial<CapabilityDispatchAdapters> = {},
): CapabilityDispatchAdapters {
  const router = createRouter(bindings.broker);
  const production: CapabilityDispatchAdapters = {
    async authorize(permission, request) {
      if (!router) return { allowed: false, reason: '审批管线不可用，拒绝能力调用' };
      const result = await router.authorize(permission, {
        callId: request.callId,
        toolId: request.toolId,
        proposal: request.proposal,
      });
      if (result.allowed) return { allowed: true };
      return {
        allowed: false,
        reason: result.decision?.verdict === 'rejected' ? '用户拒绝该提议' : '提议未获批准（超时或未配置审批表面）',
      };
    },
    execute: (call, context) => executeCapability(call, context, bindings),
    fence: (text, origin) => fenceUntrusted(text, { origin, kind: 'plugin-capability' }),
  };
  return { ...production, ...overrides };
}

/** 生产工具提议端口：白名单派发 + 审批 + 围栏（缺省拒绝，见 core/plugin/capabilityDispatch）。 */
export function createPluginToolProposalPort(
  bindings: CapabilityHostBindings = {},
  overrides: Partial<CapabilityDispatchAdapters> = {},
): ToolProposalPort {
  return createCapabilityDispatchPort(createPluginCapabilityAdapters(bindings, overrides));
}
