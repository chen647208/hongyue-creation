/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import en from './locales/en.js';
import zh from './locales/zh.js';

/** 中英字典全量：主进程网关取文案时一次装齐，不区分当前语言。 */
export const resources = { zh, en } as const;
