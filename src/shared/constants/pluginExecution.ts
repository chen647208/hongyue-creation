/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件脚本执行资源限额单源（docs/design/49 §3）：超时、内存、输出上限只改本文件。
 * 沙箱默认限额（shared/sandbox.ts）与脚本执行请求（core/plugin/runtime.ts）共用同一组值。
 */

/** QuickJS 线性内存上限（字节），超限中断为 memory 错误。 */
export const PLUGIN_SCRIPT_MEMORY_BYTES = 16 * 1024 * 1024;

/** 墙钟超时（毫秒），超时中断为 timeout 错误。 */
export const PLUGIN_SCRIPT_TIMEOUT_MS = 3000;

/** 序列化后输出上限（字节），超限为 limit 错误。 */
export const PLUGIN_SCRIPT_MAX_OUTPUT_BYTES = 256 * 1024;

/** 渲染器同步执行的墙钟超时（毫秒）：同步路径阻塞渲染进程，保持毫秒级，禁秒级长任务。 */
export const PLUGIN_RENDERER_TIMEOUT_MS = 100;
