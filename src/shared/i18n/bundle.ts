/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { AppLanguage } from '../types.js';
import zh from './locales/zh.js';

/** 命名空间名 → 该命名空间的译文表。 */
export type Dictionary = Record<string, Record<string, unknown>>;

/**
 * 字典加载：默认语言随主包静态装入，其余语言按需动态加载。
 * 未启用语言因此不进首屏 chunk（一份完整字典约 260KB）。
 *
 * 静态键是「默认语言」的优化位，不是正确性依赖：改 `catalog` 的 DEFAULT_LANGUAGE
 * 不会让取词出错，只会让该语言失去静态装入的好处。新增语言时在 lazy 里加一行。
 */
const staticDictionaries: Partial<Record<AppLanguage, Dictionary>> = { zh };

const lazyDictionaries: Partial<Record<AppLanguage, () => Promise<{ default: Dictionary }>>> = {
  en: () => import('./locales/en.js'),
};

/** 取一份语言的完整字典；静态语言同步可用，动态语言首次调用才加载。 */
export function loadDictionary(language: AppLanguage): Promise<Dictionary | undefined> {
  const staticOne = staticDictionaries[language];
  if (staticOne) return Promise.resolve(staticOne);
  const load = lazyDictionaries[language];
  return load ? load().then((module) => module.default) : Promise.resolve(undefined);
}
