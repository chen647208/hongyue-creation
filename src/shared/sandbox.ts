/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件沙箱契约（docs/design/21 §4）：资源限额、请求/结果与错误分类。
 * 主进程与渲染层共用的单源（跨 IPC 边界序列化）。
 */

export interface SandboxLimits {
  /** QuickJS 线性内存上限（字节）。 */
  memoryBytes: number;
  /** 墙钟超时（毫秒），超时中断执行。 */
  timeoutMs: number;
  /** 序列化后输出上限（字节），超限视为 limit 错误。 */
  maxOutputBytes: number;
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  memoryBytes: 16 * 1024 * 1024,
  timeoutMs: 3000,
  maxOutputBytes: 256 * 1024,
};

export type SandboxErrorKind = 'timeout' | 'memory' | 'runtime' | 'limit' | 'capability' | 'permission';

/** WASM 宿主函数种类（受控实现，见 wasmRunner）。 */
export type WasmHostKind = 'now' | 'log' | 'hash';

/** WASM 导入授权：module.name 映射到受控实现种类。 */
export interface WasmHostFunctionSpec {
  module: string;
  name: string;
  kind: WasmHostKind;
}

export interface SandboxError {
  kind: SandboxErrorKind;
  message: string;
}

/** handler 提出的工具调用（经技能白名单过滤后由宿主执行）。 */
export interface SandboxToolCall {
  tool: string;
  args: unknown;
}

export interface SandboxRunRequest {
  /** 待执行代码；JS 轨应定义 `function run(input)`，WASM 轨见 moduleBase64。 */
  code: string;
  input?: unknown;
  limits?: Partial<SandboxLimits>;
  /** 技能声明的工具白名单；handler 提议的越界工具调用被拒。 */
  allowedTools?: readonly string[];
  /** 执行形态：js（QuickJS）或 wasm（无导入纯计算模块）。 */
  mode?: 'js' | 'wasm';
  /** WASM 轨的模块字节（base64）。 */
  moduleBase64?: string;
  /** WASM 允许的导入（`module.name`）；默认拒绝任何导入。 */
  allowedImports?: readonly string[];
  /** WASM 宿主函数授权：声明可用的受控导入实现。 */
  hostFunctions?: readonly WasmHostFunctionSpec[];
}

export interface SandboxRunResult {
  ok: boolean;
  output?: unknown;
  toolCalls?: SandboxToolCall[];
  error?: SandboxError;
}
