/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 视图公式脚本的沙箱上限。公式是可序列化的纯函数表达式，
 * 不触达网络与文件；超限即求值失败（返回空串），不抛出、不中断渲染。
 */
export const FORMULA_MAX_NODES = 256;
export const FORMULA_MAX_DEPTH = 16;
export const FORMULA_MAX_ARGS = 16;
