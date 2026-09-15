/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 变体包的默认导出类型修正。
 *
 * `@jitl/quickjs-wasmfile-release-sync` 以 CommonJS 发布，其 `dist/index.d.ts` 用 ESM
 * 语法声明默认导出；`moduleResolution: NodeNext` 下会被解析为命名空间，导致默认导入丢失
 * `QuickJSSyncVariant` 结构。这里显式声明默认导出，与运行时（`import` 条件加载 `index.mjs`）
 * 的默认导出对齐。
 */
declare module '@jitl/quickjs-wasmfile-release-sync' {
  import type { QuickJSSyncVariant } from 'quickjs-emscripten-core';

  const variant: QuickJSSyncVariant;
  export default variant;
}
