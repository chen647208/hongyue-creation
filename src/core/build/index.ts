/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 构建管线出口（docs/design/07）：profile + select/transform/render。 */
export {
  buildCoverSvg,
  type CoverOptions,
  escapeXml,
  wrapTitle,
} from './cover.js';
export {
  buildDocxFiles,
  buildEpubFiles,
  htmlToDocxParagraphs,
} from './package.js';
export {
  applyMaterialPolicy,
  applyRange,
  type DocBlock,
  listRenderers,
  listTransformers,
  type MaterialPolicy,
  registerRenderer,
  registerTransformer,
  renderDoc,
  type Renderer,
  runBuild,
  select,
  type SelectedNode,
  type TocEntry,
  transform,
  type Transformer,
} from './pipeline.js';
export {
  type BuildCompile,
  type BuildHeadings,
  type BuildProfile,
  type BuildRange,
  type BuildRender,
  type BuildSelection,
  type BuildToc,
  type BuildTransform,
  clampHeadingLevel,
  COMPENDIUM_BUILD_PROFILE,
  COMPILE_DEFAULTS,
  DEFAULT_BUILD_PROFILE,
  MANUSCRIPT_BUILD_PROFILE,
  normalizeProfile,
  parseProfileYaml,
  roundtripProfile,
  serializeProfileYaml,
  typeMatches,
  validateProfile,
} from './profile.js';
