/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

export { bootstrapI18n } from './bootstrap';
export {
  changeLanguage,
  DEFAULT_LANGUAGE,
  getEffectiveLanguage,
  i18n,
  initI18n,
  NAMESPACES,
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
} from './config';
// 数据目录型（运行时组合键）取词助手：服务商名称/描述/提示、模板显示名等。
export { dt, dtList, templateDisplayName } from './dynamic';
// 统一从 @/i18n 暴露 react-i18next 的取词入口，组件无需直接依赖第三方包路径。
export { Trans,useTranslation } from 'react-i18next';
