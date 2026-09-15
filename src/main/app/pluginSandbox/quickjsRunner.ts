/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * QuickJS 沙箱运行时（docs/design/21 §4 的引擎隔离层）。
 *
 * 在独立 QuickJS 实例里执行插件代码：内存上限 + 墙钟中断；宿主对象图不可达。
 * 约定插件定义 `function run(input)`，其返回值即输出。
 */

import { getQuickJS } from '../../../shared/quickjs.js';
import {
  DEFAULT_SANDBOX_LIMITS,
  type SandboxError,
  type SandboxRunRequest,
  type SandboxRunResult,
} from '../../../shared/sandbox.js';

function classify(dumped: unknown, timedOut: boolean): SandboxError {
  if (timedOut) return { kind: 'timeout', message: '执行超时，已中断' };
  // 内存超限时 QuickJS 无法构造错误对象，dump 为 null/undefined
  if (dumped === null || dumped === undefined) return { kind: 'memory', message: '执行被中止（疑似内存超限）' };
  const message =
    typeof dumped === 'string'
      ? dumped
      : dumped && typeof dumped === 'object' && 'message' in dumped
        ? String((dumped as { message: unknown }).message)
        : String(dumped);
  if (/out of memory|memory limit/i.test(message)) return { kind: 'memory', message };
  return { kind: 'runtime', message };
}

/** 执行一段沙箱代码；`onLog` 接收插件 `console.*` 输出。 */
export async function runQuickJS(
  request: SandboxRunRequest,
  onLog?: (level: string, message: string) => void,
): Promise<SandboxRunResult> {
  const limits = { ...DEFAULT_SANDBOX_LIMITS, ...request.limits };
  const deadline = Date.now() + limits.timeoutMs;
  let timedOut = false;

  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setInterruptHandler(() => {
    if (Date.now() > deadline) {
      timedOut = true;
      return true;
    }
    return false;
  });
  const context = runtime.newContext();

  try {
    const inputHandle = context.newString(JSON.stringify(request.input ?? null));
    context.setProp(context.global, '__INPUT_JSON', inputHandle);
    inputHandle.dispose();

    const logFn = context.newFunction('log', (levelHandle, msgHandle) => {
      onLog?.(context.getString(levelHandle), context.getString(msgHandle));
      return context.undefined;
    });
    context.setProp(context.global, '__hostLog', logFn);
    logFn.dispose();
    const consoleInit = context.evalCode(
      'globalThis.console = { log: (m) => __hostLog("log", String(m)), ' +
        'error: (m) => __hostLog("error", String(m)), ' +
        'warn: (m) => __hostLog("warn", String(m)) };',
    );
    if ('error' in consoleInit && consoleInit.error) consoleInit.error.dispose();
    else consoleInit.value.dispose();

    const evaluated = context.evalCode(request.code, 'plugin.js');
    if (evaluated.error) {
      const dumped = context.dump(evaluated.error);
      evaluated.error.dispose();
      return { ok: false, error: classify(dumped, timedOut) };
    }
    evaluated.value.dispose();

    const runHandle = context.getProp(context.global, 'run');
    if (context.typeof(runHandle) !== 'function') {
      runHandle.dispose();
      return { ok: false, error: { kind: 'runtime', message: '插件未定义 run(input) 函数' } };
    }

    const inputValue = context.evalCode('JSON.parse(__INPUT_JSON)');
    if (inputValue.error) {
      const dumped = context.dump(inputValue.error);
      inputValue.error.dispose();
      runHandle.dispose();
      return { ok: false, error: classify(dumped, timedOut) };
    }

    const called = context.callFunction(runHandle, context.undefined, inputValue.value);
    inputValue.value.dispose();
    runHandle.dispose();
    if (called.error) {
      const dumped = context.dump(called.error);
      called.error.dispose();
      return { ok: false, error: classify(dumped, timedOut) };
    }
    const raw = context.dump(called.value);
    called.value.dispose();

    let serialized: string;
    try {
      serialized = JSON.stringify(raw ?? null);
    } catch {
      return { ok: false, error: { kind: 'runtime', message: '返回值无法序列化' } };
    }
    if (serialized.length > limits.maxOutputBytes) {
      return { ok: false, error: { kind: 'limit', message: `输出 ${serialized.length} 字节超上限 ${limits.maxOutputBytes}` } };
    }
    return { ok: true, output: raw };
  } finally {
    context.dispose();
    runtime.dispose();
  }
}
