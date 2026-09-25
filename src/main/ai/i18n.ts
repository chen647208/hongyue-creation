/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 主进程侧 i18n：网关产生的用户可见文案（适配器错误、流式提示）与
 * 主进程原生对话框文案（信任公钥确认等）。语言取自系统 locale（app.getLocale()），
 * 字典取全量语言，与渲染端同源于 src/shared/i18n。
 */
import i18next from 'i18next';

import { DEFAULT_LANGUAGE, normalizeLanguage, SUPPORTED_LANGUAGES } from '../../shared/i18n/catalog.js';
import { resources } from '../../shared/i18n/resources.js';

/** 主进程独立实例，避免与渲染端全局单例耦合；只加载主进程会用到的命名空间。 */
const instance = i18next.createInstance();

let initialized = false;

/** 初始化主进程 i18n。幂等；gateway boot 与首个 IPC Provider boot 时以 app.getLocale() 调用。 */
export async function initMainI18n(locale: string | undefined): Promise<void> {
  if (initialized) return;
  await instance.init({
    resources,
    lng: normalizeLanguage(locale) ?? DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    ns: ['errors', 'app'],
    defaultNS: 'errors',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  initialized = true;
}

/** 兼容既有调用方：网关错误文案初始化（与 initMainI18n 等价）。 */
export const initAiI18n = initMainI18n;

/** 取主进程错误文案（errors 命名空间）；未初始化时回退 key，保证不抛错。 */
export function aiT(key: string, params?: Record<string, unknown>): string {
  if (!initialized) return key;
  return instance.t(key, { ns: 'errors', ...params }) as string;
}

/** 取主进程应用文案（app 命名空间，如原生对话框按钮与正文）。 */
export function tMain(key: string, params?: Record<string, unknown>): string {
  if (!initialized) return key;
  return instance.t(key, { ns: 'app', ...params }) as string;
}
