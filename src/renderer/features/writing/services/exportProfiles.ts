/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 导出档案的轻量装配：默认快速档案与对话框覆盖项叠加。
 * 只依赖档案常量与校验，不引构建管线；导出对话框打开前的渲染路径可直接引用。
 */
import { type BuildProfile, clampHeadingLevel, COMPILE_DEFAULTS, roundtripProfile } from '@core/build/profile';

import { i18n } from '@/i18n';

import type { ExportCompileOptions, ExportFormat } from '../types';

/**
 * 把导出对话框的编译覆盖项叠加到档案上：素材口径、目录、标题层级、章节范围。
 * 深拷贝后修改，不改动内置档案；范围两端都为空时清除 range。
 */
export const applyExportCompileOptions = (profile: BuildProfile, options: ExportCompileOptions): BuildProfile => {
  const next = roundtripProfile(profile);
  // 类型级分卷：把所选分卷类型并入参与构建的类型，否则对应节点不会进入选段。
  const includeTypes = [...next.selection.includeTypes];
  for (const type of options.volumeTypes) {
    if (!includeTypes.includes(type)) includeTypes.push(type);
  }
  next.selection = { ...next.selection, includeTypes, materialPolicy: options.materialPolicy };
  const from = options.rangeFrom ?? undefined;
  const to = options.rangeTo ?? undefined;
  next.selection.range = from !== undefined || to !== undefined ? { from, to } : undefined;
  next.transform = {
    ...next.transform,
    headings: { ...next.transform.headings, level: clampHeadingLevel(options.headingLevel) },
  };
  const existingToc = next.compile?.toc;
  const tocDepth = Number.isInteger(options.tocDepth) ? Math.max(1, options.tocDepth) : COMPILE_DEFAULTS.tocMaxDepth;
  next.compile = {
    ...next.compile,
    toc: {
      enabled: options.tocEnabled,
      title: existingToc?.title || i18n.t('writing:export.tocTitle'),
      maxDepth: tocDepth,
    },
    volumeIds: options.volumeIds,
    volumeTypes: options.volumeTypes,
    frontMatter: options.frontMatterIds,
    backMatter: options.backMatterIds,
  };
  return next;
};

/**
 * 未选预设时的默认快速导出档案：章节模板取 i18n 文案、引用原样保留，
 * 与历史单路径导出口径一致（默认档案等价现状）。
 */
export const buildQuickExportProfile = (format: ExportFormat): BuildProfile => {
  const buildFormat = format === 'pdf' ? 'html' : format;
  const chapterTemplate = i18n.t('writing:export.chapterHeader', { num: '%N', title: '%T' });
  return {
    name: '快速导出',
    format: buildFormat,
    selection: {
      includeTypes: ['novel.chapter'],
      includeInactive: false,
      exclude: [],
      rootSwitches: { cards: false, meta: false },
    },
    transform: {
      headings: { chapter: chapterTemplate, scene: '* * *', hide: [], renumber: true },
      content: { includeSynopsis: false, includeComments: false, stripTags: [], resolveRefs: 'raw' },
    },
    render: { chapterPageBreak: buildFormat === 'html' || format === 'rtf', stripUnicode: false },
  };
};
