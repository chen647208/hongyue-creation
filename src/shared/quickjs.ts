/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * QuickJS 引擎单源（主进程沙箱与渲染进程同步渲染器共用）。
 *
 * 经 `quickjs-emscripten-core` 的 `newQuickJSWASMModuleFromVariant` 只加载
 * `@jitl/quickjs-wasmfile-release-sync`（release + sync 变体）；直接引用变体包而非
 * `quickjs-emscripten` 聚合包，后者静态导入 debug/release × sync/asyncify 四个变体，
 * 会把三个未使用的 wasm 一并打进产物。
 *
 * 模块按进程 memoize：同一进程内只实例化一个 WASM 模块（V8 对模块数量有硬上限）。
 */

import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';

let modulePromise: Promise<QuickJSWASMModule> | undefined;

/** 取得（并缓存）RELEASE_SYNC 变体的 QuickJS WASM 模块。 */
export function getQuickJS(): Promise<QuickJSWASMModule> {
  modulePromise ??= newQuickJSWASMModuleFromVariant(RELEASE_SYNC);
  return modulePromise;
}
