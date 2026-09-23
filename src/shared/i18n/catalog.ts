/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 跨进程共享的 i18n 元信息：语言清单、命名空间清单与语言归一化。
 * 字典本体在同级 `locales/<lang>.ts`：渲染进程经 `bundle.ts` 只装当前语言，
 * 未启用语言因此不进首屏 chunk；主进程经 `resources.ts` 一次取全量。
 */
import type { AppLanguage } from '../types.js';

/** 支持的语言。新增语言时在此扩展并补一份对应字典。 */
export const SUPPORTED_LANGUAGES: readonly AppLanguage[] = ['zh', 'en'];
/** 兜底语言：检测失败或语言不受支持时回退。 */
export const DEFAULT_LANGUAGE: AppLanguage = 'zh';
/** 命名空间清单，随功能迁移逐步扩充。 */
export const NAMESPACES = ['common', 'settings', 'nav', 'app', 'errors', 'providers', 'books', 'version', 'timeline', 'foreshadow', 'steps', 'characters', 'world', 'consistency', 'knowledge', 'writing', 'assistant', 'cards', 'prompts', 'onboarding'] as const;


/** 把任意 navigator/字符串语言标签归一化为受支持的 AppLanguage。 */
export function normalizeLanguage(raw: string | undefined | null): AppLanguage | undefined {
  if (!raw) return undefined;
  const base = raw.toLowerCase().split('-')[0] ?? '';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base)
    ? (base as AppLanguage)
    : undefined;
}
