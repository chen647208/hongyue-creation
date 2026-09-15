/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 渲染器同步执行端口（docs/design/49 §4 选型 B）。
 *
 * 生产实现：首次激活含 `renderers` 的插件时 `preheat` 异步加载 QuickJS 模块、在独立
 * runtime/context 内编译入口并缓存；随后 `render` 在渲染进程内**同步**调用已编译纯函数。
 *
 * 沿用主进程 `pluginSandbox/quickjsRunner.ts` 的同一 `quickjs-emscripten` 变体（RELEASE_SYNC），
 * 不引入第二套引擎。模块经动态 `import('quickjs-emscripten')` 懒加载：只有真正预热逻辑插件时才
 * 载入沙箱 chunk，未安装逻辑插件时主包不含它。
 *
 * 隔离取舍（design/49 §4）：执行落在渲染进程内，故只接受 `pure + sync` 描述符、不向沙箱注入
 * 任何宿主对象（无 fetch/fs/eval）。限额三项齐备：内存上限、墙钟超时中断、输出字节上限；
 * 任一超限即返回结构化错误并中断，失败不冒泡。
 */

import type { RendererExecutionPort, RendererRunResult, ScriptRunError } from '@core/plugin';
import { PLUGIN_SCRIPT_MAX_OUTPUT_BYTES, PLUGIN_SCRIPT_MEMORY_BYTES } from '@shared/constants/pluginExecution';
import type { QuickJSContext, QuickJSHandle, QuickJSRuntime } from 'quickjs-emscripten';

const encoder = new TextEncoder();

interface WarmRenderer {
  /** 引擎加载失败时为 undefined（该入口始终拒绝执行）。 */
  runtime?: QuickJSRuntime;
  context?: QuickJSContext;
  /** 模块形式入口的导出命名空间；无 export 的全局函数入口为 undefined。 */
  exports?: QuickJSHandle;
  /** 本次同步调用的墙钟截止时间；中断处理器据此判定超时。 */
  deadline: { at: number };
  /** 本次调用是否被中断处理器判定超时。 */
  timedOut: boolean;
  /** 预热期编译失败原因；一旦置位，该入口始终拒绝执行（fail-closed）。 */
  compileError?: string;
}

const warmCache = new Map<string, WarmRenderer>();

/** 缓存键：不同插件的插件内相对入口路径可同名，用 `pluginId` 隔离。 */
function warmKey(pluginId: string, entry: string): string {
  return `${pluginId}\u0000${entry}`;
}

/** 动态载入 QuickJS 沙箱模块（与主进程 quickjsRunner 同一 RELEASE_SYNC 变体）。 */
async function loadQuickJSModule() {
  const { getQuickJS } = await import('quickjs-emscripten');
  return getQuickJS();
}

function disposeWarm(warm: WarmRenderer): void {
  try {
    warm.exports?.dispose();
  } catch {
    // 单个 dispose 失败不阻断
  }
  try {
    warm.context?.dispose();
  } catch {
    // 同上
  }
  try {
    warm.runtime?.dispose();
  } catch {
    // 同上
  }
}

/** 沙箱错误分类：超时/内存/运行期三档，文案与主进程沙箱口径一致。 */
export function classifyRendererError(dumped: unknown, timedOut: boolean): ScriptRunError {
  if (timedOut) return { kind: 'timeout', message: '渲染器执行超时，已中断' };
  if (dumped === null || dumped === undefined) {
    return { kind: 'memory', message: '渲染器执行被中止（疑似内存超限）' };
  }
  const message =
    typeof dumped === 'string'
      ? dumped
      : dumped && typeof dumped === 'object' && 'message' in dumped
        ? String((dumped as { message: unknown }).message)
        : String(dumped);
  if (/out of memory|memory limit/i.test(message)) return { kind: 'memory', message };
  return { kind: 'runtime', message };
}

/** 生产渲染器同步执行端口：预热缓存 + 同步调用 + 三项限额。 */
export function createRendererExecutionPort(): RendererExecutionPort {
  return {
    async preheat(pluginId, entry, source): Promise<void> {
      const key = warmKey(pluginId, entry);
      const existing = warmCache.get(key);
      if (existing) {
        if (!existing.compileError) return;
        disposeWarm(existing);
        warmCache.delete(key);
      }
      let loadError: unknown;
      // 动态导入：只有真正预热逻辑插件时才载入沙箱 chunk。
      const QuickJS = await loadQuickJSModule().catch((error: unknown) => {
        loadError = error;
        return undefined;
      });
      if (!QuickJS) {
        warmCache.set(key, {
          deadline: { at: Number.POSITIVE_INFINITY },
          timedOut: false,
          compileError: `渲染器沙箱引擎加载失败：${loadError instanceof Error ? loadError.message : String(loadError)}`,
        });
        return;
      }
      const runtime = QuickJS.newRuntime();
      runtime.setMemoryLimit(PLUGIN_SCRIPT_MEMORY_BYTES);
      // 预热期不设墙钟截止（Infinity）：中断处理器只在 render 设定 deadline 后生效。
      const warm: WarmRenderer = {
        runtime,
        deadline: { at: Number.POSITIVE_INFINITY },
        timedOut: false,
      };
      runtime.setInterruptHandler(() => {
        if (Date.now() > warm.deadline.at) {
          warm.timedOut = true;
          return true;
        }
        return false;
      });
      const context = runtime.newContext();
      warm.context = context;
      // 入口源码在预热期一次性求值；导出函数在 render 时同步解析。
      // 含 export 的源码被 QuickJS 按模块求值，返回值为导出命名空间；否则按全局脚本求值。
      const evaluated = context.evalCode(source, entry);
      if (evaluated.error) {
        const dumped = context.dump(evaluated.error);
        evaluated.error.dispose();
        warm.compileError = `渲染器入口编译失败：${String(dumped)}`;
      } else if (context.typeof(evaluated.value) === 'object') {
        warm.exports = evaluated.value;
      } else {
        evaluated.value.dispose();
      }
      warmCache.set(key, warm);
    },

    release(pluginId, entry): void {
      const key = warmKey(pluginId, entry);
      const warm = warmCache.get(key);
      if (!warm) return;
      warmCache.delete(key);
      if (warm.context) disposeWarm(warm);
    },

    render(request): RendererRunResult {
      const warm = warmCache.get(warmKey(request.pluginId, request.entry));
      if (!warm) {
        return { ok: false, error: { kind: 'runtime', message: '渲染器尚未预热完成，拒绝同步执行' } };
      }
      if (warm.compileError) {
        return { ok: false, error: { kind: 'runtime', message: warm.compileError } };
      }
      const context = warm.context;
      if (!context) {
        return { ok: false, error: { kind: 'runtime', message: warm.compileError ?? '渲染器沙箱不可用，拒绝同步执行' } };
      }
      warm.timedOut = false;
      warm.deadline.at = Date.now() + request.timeoutMs;
      const fail = (error: ScriptRunError): RendererRunResult => {
        // 超时/内存可能损坏 runtime：释放并标记，后续同入口一律拒绝（fail-closed）。
        if (error.kind === 'timeout' || error.kind === 'memory') {
          warm.compileError = error.message;
          disposeWarm(warm);
        }
        return { ok: false, error };
      };
      try {
        // 先取模块导出命名空间，再回落到全局函数（两种入口写法都可）。
        let fnHandle = warm.exports ? context.getProp(warm.exports, request.export) : undefined;
        if (fnHandle && context.typeof(fnHandle) !== 'function') {
          fnHandle.dispose();
          fnHandle = undefined;
        }
        fnHandle = fnHandle ?? context.getProp(context.global, request.export);
        if (context.typeof(fnHandle) !== 'function') {
          fnHandle.dispose();
          return { ok: false, error: { kind: 'not-found', message: `渲染器入口未导出函数 ${request.export}` } };
        }
        const inputString = context.newString(JSON.stringify(request.input ?? null));
        context.setProp(context.global, '__PLUGIN_INPUT_JSON', inputString);
        inputString.dispose();
        const inputValue = context.evalCode('JSON.parse(__PLUGIN_INPUT_JSON)');
        if (inputValue.error) {
          const dumped = context.dump(inputValue.error);
          inputValue.error.dispose();
          fnHandle.dispose();
          return fail(classifyRendererError(dumped, warm.timedOut));
        }
        const called = context.callFunction(fnHandle, context.undefined, inputValue.value);
        inputValue.value.dispose();
        fnHandle.dispose();
        if (called.error) {
          const dumped = context.dump(called.error);
          called.error.dispose();
          return fail(classifyRendererError(dumped, warm.timedOut));
        }
        const raw = context.dump(called.value);
        called.value.dispose();
        if (typeof raw !== 'string') {
          return { ok: false, error: { kind: 'schema', message: `渲染器必须同步返回字符串，实际 ${raw === null ? 'null' : typeof raw}` } };
        }
        const bytes = encoder.encode(raw).length;
        if (bytes > PLUGIN_SCRIPT_MAX_OUTPUT_BYTES) {
          return { ok: false, error: { kind: 'limit', message: `输出 ${bytes} 字节超上限 ${PLUGIN_SCRIPT_MAX_OUTPUT_BYTES}` } };
        }
        return { ok: true, text: raw };
      } catch (error) {
        return fail({ kind: 'runtime', message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
