/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件脚本执行面（docs/design/49：沙箱执行）。
 *
 * 宿主 `PluginHost.runScript` 在本层之上做门控：仅当插件激活、脚本描述符已注册、
 * 触发挂点匹配、运行期能力回查通过且入口存在时，才把入口文件交注入的执行端口。
 * 端口缺省即拒绝执行（fail-closed）；生产端口走主进程 `pluginSandbox` IPC。
 * 本层不持有沙箱实现，也不向插件暴露宿主对象：网络、文件、`eval` 均不经此通道。
 */

import {
  type DescriptorSchema,
  type HostCapability,
  parseHostCapability,
  type ScriptDescriptor,
} from './descriptors.js';
import type { PluginManifest } from './manifest.js';
import type {
  SandboxErrorKind,
  SandboxRunRequest,
  SandboxRunResult,
  SandboxToolCall,
} from './sandbox/types.js';

/** 脚本执行端口：注入既有沙箱（主进程 QuickJS/utilityProcess，或测试假实现）。 */
export type ScriptExecutionPort = (request: SandboxRunRequest) => Promise<SandboxRunResult>;

/** 脚本执行错误种类：沙箱种类外加声明门禁的 `not-found`（入口缺失）与 `schema`（形状不符）。 */
export type ScriptRunErrorKind = SandboxErrorKind | 'not-found' | 'schema';

export interface ScriptRunError {
  kind: ScriptRunErrorKind;
  message: string;
}

/** 脚本执行结果：失败必带可读原因，deny-by-default 的门禁拒绝也走此结构。 */
export interface ScriptRunOutcome {
  ok: boolean;
  output?: unknown;
  toolCalls?: SandboxToolCall[];
  /** 已执行的能力调用回执（net/ai 文本已围栏）；无工具提议时缺席。 */
  toolResults?: ToolCallResult[];
  error?: ScriptRunError;
}

/** 门禁拒绝结果（未激活、未注册、越权、未配置端口）。 */
export function scriptDenied(message: string): ScriptRunOutcome {
  return { ok: false, error: { kind: 'permission', message } };
}

/**
 * 按描述符 schema 的顶层 `type` 做最小形状校验：只认 JSON Schema 的 `type` 字段，
 * 未声明 `type` 即不限制。`integer` 要求整数值。
 */
export function checkDescriptorSchema(
  value: unknown,
  schema: DescriptorSchema | undefined,
  label: 'input' | 'output',
): string | undefined {
  const expected = schema?.type;
  if (typeof expected !== 'string') return undefined;
  if (expected === 'integer') {
    return typeof value === 'number' && Number.isInteger(value)
      ? undefined
      : `${label} 形状不符：期望 integer，实际 ${schemaTypeOf(value)}`;
  }
  const actual = schemaTypeOf(value);
  return expected === actual ? undefined : `${label} 形状不符：期望 ${expected}，实际 ${actual}`;
}

/** 描述符入口文件与导出名组合为沙箱代码：定义 `run(input)` 供沙箱调用。 */
export function buildScriptRunCode(descriptor: ScriptDescriptor, source: string): string {
  return `${source}\n;globalThis.run = typeof ${descriptor.export} === 'function' ? ${descriptor.export} : undefined;`;
}

/** 沙箱输出与错误共用的类型名（与 JSON Schema 的 type 对齐）。 */
function schemaTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// ── 渲染器同步执行（design/49 §4 选型 B）────────────────────────────────

/**
 * 渲染器同步执行端口：宿主同步调用已预热的纯函数并取回输出文本。
 *
 * 端口缺省即拒绝（fail-closed）。实现须保持毫秒级：同步路径阻塞渲染进程，
 * 禁止秒级长任务；`preheat` 供实现编译/缓存入口，`render` 只做同步调用。
 */
export interface RendererExecutionPort {
  /**
   * 预热入口：宿主在首次渲染前调用一次，实现据此异步编译并缓存纯函数。
   * 允许返回 Promise——加载沙箱引擎本身是异步的；`render` 仍保持同步。
   * `pluginId` 参与缓存键：不同插件的插件内相对入口路径可同名，必须隔离。
   */
  preheat?(pluginId: string, entry: string, source: string): void | Promise<void>;
  /** 释放某插件入口的预热缓存（插件停用/卸载时调用，避免常驻句柄泄漏）。 */
  release?(pluginId: string, entry: string): void;
  /** 同步调用已预热的纯函数，返回输出文本。 */
  render(request: RendererRunRequest): RendererRunResult;
}

export interface RendererRunRequest {
  /** 所属插件 id（缓存键组成部分）。 */
  pluginId: string;
  /** 插件内相对入口文件。 */
  entry: string;
  /** 入口文件导出的具名函数。 */
  export: string;
  /** 入口文件源码。 */
  source: string;
  input: unknown;
  /** 墙钟超时（毫秒）；实现须在此内中断并返回 timeout 错误。 */
  timeoutMs: number;
}

export interface RendererRunResult {
  ok: boolean;
  /** 成功时的输出文本。 */
  text?: string;
  error?: ScriptRunError;
}

/** 渲染器执行结果：失败必带可读原因，门禁拒绝也走此结构。 */
export interface RendererRunOutcome {
  ok: boolean;
  text?: string;
  error?: ScriptRunError;
}

/** 渲染器门禁拒绝结果（未激活、未注册、非纯同步、越权、未配置端口）。 */
export function rendererDenied(message: string): RendererRunOutcome {
  return { ok: false, error: { kind: 'permission', message } };
}

// ── 受控能力映射与工具提议（design/49 §2）──────────────────────────────

/** 解析后的受控能力映射：只含描述符声明且 manifest 权限放行的条目，未声明不可见。 */
export interface CapabilityMap {
  read: string[];
  write: string[];
  net: boolean;
  ai: boolean;
  toolPropose: boolean;
}

export type CapabilityResolution =
  | { ok: true; capabilities: HostCapability[]; map: CapabilityMap }
  | { ok: false; reason: string };

/**
 * 逐条回查描述符声明的能力并回查 manifest 权限；任一条越权即整体拒绝（deny-by-default）。
 * 返回值只含通过校验的条目，未声明的能力不进入映射。
 */
export function resolveCapabilities(
  declared: readonly string[] | undefined,
  manifest: PluginManifest,
): CapabilityResolution {
  const capabilities: HostCapability[] = [];
  for (const raw of declared ?? []) {
    const check = parseHostCapability(raw, manifest);
    if (!check.ok) return { ok: false, reason: check.reason };
    capabilities.push(check.capability);
  }
  const map: CapabilityMap = { read: [], write: [], net: false, ai: false, toolPropose: false };
  for (const capability of capabilities) {
    if (capability.kind === 'read' || capability.kind === 'write') map[capability.kind].push(capability.domain);
    else if (capability.kind === 'net') map.net = true;
    else if (capability.kind === 'ai') map.ai = true;
    else map.toolPropose = true;
  }
  return { ok: true, capabilities, map };
}

/** 能力字符串（宿主契约名，沙箱所见白名单条目）。 */
export function capabilityName(capability: HostCapability): string {
  if (capability.kind === 'read' || capability.kind === 'write') {
    return `${capability.kind}:${capability.domain}`;
  }
  if (capability.kind === 'tool') return `tool:${capability.action}`;
  return capability.kind;
}

/**
 * 工具提议白名单：取已声明的读写/网络/AI 能力名；未声明的能力名不在清单，工具调用被裁决拒绝。
 * `tool:propose` 是提议通道的开关（见 `CapabilityMap.toolPropose`），不进白名单。
 */
export function allowedToolNames(capabilities: readonly HostCapability[]): string[] {
  return capabilities.filter((capability) => capability.kind !== 'tool').map(capabilityName);
}

/** 工具提议请求：脚本只能"提议"，执行归宿主审批管线，脚本拿不到写操作。 */
export interface ToolProposalRequest {
  pluginId: string;
  scriptId: string;
  capabilities: CapabilityMap;
  proposals: readonly SandboxToolCall[];
}

/** 单次能力调用回执：外部内容已由宿主围栏（`untrusted`）后再回给调用方。 */
export interface ToolCallResult {
  tool: string;
  /** 宿主契约返回的文本（net/ai 结果已围栏为不可信输入）。 */
  text: string;
}

export interface ToolProposalResult {
  ok: boolean;
  /** 受理并进入审批管线的提案数。 */
  accepted?: number;
  /** 逐条能力调用回执（只含放行并执行成功的条目）。 */
  results?: ToolCallResult[];
  error?: ScriptRunError;
}

/**
 * 工具提议端口：接既有提案/审批管线（read 直通 / write:proposal 弹批 / write:direct 审计）。
 * 未配置端口即拒绝全部提议（fail-closed）；本层不执行任何写操作。
 */
export type ToolProposalPort = (request: ToolProposalRequest) => Promise<ToolProposalResult>;

// ── 宿主脚本事件（design/49 沙箱执行：事件触发）────────────────────────

/**
 * 宿主声明的脚本事件挂点：脚本描述符的 `on` 只允许取本集合，宿主也只按本集合分发。
 * 事件名与宿主触发点一一对应；插件声明未导出的事件不会被触发。
 */
export const HOST_SCRIPT_EVENTS = ['project.open', 'chapter.open', 'chapter.save'] as const;
export type HostScriptEvent = (typeof HOST_SCRIPT_EVENTS)[number];

/** 未知事件判定：`PluginHost.emit` 据此直接返回，不触发任何脚本。 */
export function isHostScriptEvent(value: string): value is HostScriptEvent {
  return (HOST_SCRIPT_EVENTS as readonly string[]).includes(value);
}

/** 打开项目载荷。 */
export interface ProjectOpenPayload {
  bookId: string;
  title: string;
}

/** 打开章节载荷。 */
export interface ChapterOpenPayload {
  bookId: string;
  chapterId: string;
  title: string;
}

/** 章节落盘成功载荷。 */
export interface ChapterSavePayload {
  bookId: string;
  chapterId: string;
  title: string;
}

/**
 * 事件载荷：只带定位所需的 id 与标题，不带整篇正文——正文经脚本声明的能力按需读取，
 * 避免把正文成本压到每次编辑的事件通道。执行前按描述符 `input` schema 校验形状。
 */
export type ScriptEventPayload = ProjectOpenPayload | ChapterOpenPayload | ChapterSavePayload;
