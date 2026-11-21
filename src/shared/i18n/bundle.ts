/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { AppLanguage } from '../types.js';

/** 命名空间名 → 该命名空间的译文表。 */
export type Dictionary = Record<string, Record<string, unknown>>;

/** 每种语言的字典各自成块，只有该语言被选中时才加载（一份完整字典约 130KB minified）。 */
const loaders: Partial<Record<AppLanguage, () => Promise<{ default: Dictionary }>>> = {
  zh: () => import('./locales/zh.js'),
  en: () => import('./locales/en.js'),
};

/** 同一语言只加载一次：i18next 会按命名空间并发调用 read，复用同一个 Promise。 */
const pending = new Map<AppLanguage, Promise<Dictionary>>();

/** 取一份语言的完整字典；首次调用触发该语言分包加载，之后复用已加载的 Promise。 */
export function loadDictionary(language: AppLanguage): Promise<Dictionary | undefined> {
  const loader = loaders[language];
  if (!loader) return Promise.resolve(undefined);
  let dictionary = pending.get(language);
  if (!dictionary) {
    dictionary = loader().then((module) => module.default);
    pending.set(language, dictionary);
  }
  return dictionary;
}
