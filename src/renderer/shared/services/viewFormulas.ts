/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 视图公式注册表单源（插件贡献 + 内置）。
 * 插件装配（aiRuntime → bootstrapPlugins）与视图面板共用此实例；
 * 公式是可序列化派生字段，求值走 shared/formulaScript 白名单沙箱，不执行插件代码。
 */
import { FormulaRegistry } from '@core/plugin';

export const formulaRegistry = new FormulaRegistry();
