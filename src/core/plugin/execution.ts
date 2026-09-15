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

import type { DescriptorSchema, ScriptDescriptor } from './descriptors.js';
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
