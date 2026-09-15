/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** AI 试错快照的持久化上限单源：快照只存本地侧车，不进入正式历史。 */

/** 本地保留的试错会话上限；超出按登记顺序淘汰最旧，避免本地存储无界增长。 */
export const MAX_TRIAL_SESSIONS = 20;

/** 单会话保留的快照步数上限；超出丢弃最旧一步并重排步号。 */
export const MAX_TRIAL_STEPS_PER_SESSION = 50;
