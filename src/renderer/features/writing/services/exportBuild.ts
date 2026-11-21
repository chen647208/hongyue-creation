/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 导出构建执行：项目实体 → `core/build` 三段式管线 → 文本/出版包。
 * 导出对话框与阅读预览按需加载本模块；写作主界面与字数统计不经过这里。
 */
import { buildOdtFiles } from '@core/build/odt';
import { buildDocxFiles, buildEpubFiles } from '@core/build/package';
import { runBuild } from '@core/build/pipeline';
import type { BuildProfile } from '@core/build/profile';
import type { PluginHost } from '@core/plugin';

import { i18n } from '@/i18n';
import { getBuildRendererPort } from '@/shared/services/buildRendererPort';

import type { Project } from '../../../../shared/types';
import type { ExportCompileOptions, ExportFormat } from '../types';
import { projectToBuildEntities } from './buildEntities';
import { applyExportCompileOptions, buildQuickExportProfile } from './exportProfiles';

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 导出对话框格式条中的插件渲染器候选项。 */
export interface PluginRendererOption {
  /** 命名空间化渲染器 id（`<插件短名>.renderer.<声明 id>`），即显式 rendererId。 */
  id: string;
  /** 目标导出格式 id（决定落盘扩展名与打印/打包分支）。 */
  format: string;
  /** 所属插件 id。 */
  pluginId: string;
  /** 不可用原因（所属插件未激活）；null 即可用。 */
  unavailableReason: string | null;
}

/**
 * 列出已注册的插件渲染器，供导出对话框的格式条在内置格式之后追加。
 * host 为 null（插件宿主未装配或尚未就绪）时返回空清单，格式条只显示内置格式。
 * 渲染器已注册但所属插件未激活时不可用：携带可读原因，由调用方置灰。
 */
export function listPluginRendererOptions(host: PluginHost | null): PluginRendererOption[] {
  const port = getBuildRendererPort();
  if (!port || !host) return [];
  return port.list().map((info) => ({
    id: info.id,
    format: info.format,
    pluginId: info.pluginId,
    unavailableReason: host.isActive(info.pluginId)
      ? null
      : i18n.t('writing:export.rendererPluginInactive', { plugin: info.pluginId }),
  }));
}

/**
 * 导出对话框显式选中的插件渲染器 id（null = 用内置渲染器）。
 *
 * 写入只发生在导出对话框的格式条（见 setSelectedExportRenderer）：选中插件渲染器时
 * 写入其命名空间化 id，选中内置格式或关闭对话框时写 null。
 * buildExportContent 读取它并作为 runBuild 的显式 rendererId（命中已注册渲染器时
 * 优先于同格式内置渲染器）；id 未注册（插件已停用或卸载）时忽略，回落内置渲染器。
 * 取模块级单值的原因：落盘执行在 useChapterExport，对话框与它之间只经此模块通信，
 * 不必为单个字符串透传多层 props。
 */
let selectedExportRendererId: string | null = null;

/** 设置导出对话框当前显式选择的插件渲染器；null 表示回到内置渲染器。 */
export function setSelectedExportRenderer(rendererId: string | null): void {
  selectedExportRendererId = rendererId;
}

export const buildExportContent = (project: Project, selectedChapterIds: Set<string>, format: ExportFormat = 'txt', profileOverride?: BuildProfile, compileOptions?: ExportCompileOptions) => {
  // 导出统一走 core/build 三段式管线（选择→变换→渲染），
  // 与写作统计、插件渲染器共享同一实现（单一口径，无双轨）。
  const selected = new Set(selectedChapterIds);
  const { nodes, attrs } = projectToBuildEntities(project);

  // PDF 复用 HTML 管线产出（主进程打印为 PDF），文件名与保存走 pdf 分支
  const buildFormat = format === 'pdf' ? 'html' : format;
  const unselected = project.chapters.filter((c) => !selected.has(c.id)).map((c) => `node:${c.id}`);
  const quickProfile = buildQuickExportProfile(format);
  const defaultProfile: BuildProfile = {
    ...quickProfile,
    selection: { ...quickProfile.selection, exclude: unselected },
  };
  // 选用注册表构建档（内置/插件）时套用其 selection/transform/render，格式与未选章节仍由本次导出决定
  let profile: BuildProfile = profileOverride
    ? {
        ...profileOverride,
        format: buildFormat,
        selection: { ...profileOverride.selection, exclude: [...profileOverride.selection.exclude, ...unselected] },
      }
    : defaultProfile;
  // 编译覆盖项（对话框即时设置）优先于档案缺省
  if (compileOptions) profile = applyExportCompileOptions(profile, compileOptions);

  // 插件渲染器经宿主端口注入；未装配宿主时 getBuildRendererPort 返回 undefined，只用内置渲染器。
  // 对话框显式选中的渲染器作为 runBuild 的 rendererId 传入（优先于档案内的 renderer 字段）；
  // 选中项已不在注册清单（插件停用/卸载）时忽略，回落内置渲染器。
  const rendererPort = getBuildRendererPort();
  const explicitRendererId =
    selectedExportRendererId !== null && rendererPort?.list().some((item) => item.id === selectedExportRendererId)
      ? selectedExportRendererId
      : undefined;
  const { text } = runBuild(profile, { nodes, attrs, edges: [] }, { rendererPort, rendererId: explicitRendererId });

  // RTF 是完整文档（首行文档头 + 尾行括号）：书名块插在首行之后，保持管线纯净
  if (format === 'rtf') {
    const escapeRtfLocal = (s: string): string => {
      let out = '';
      for (const ch of s) {
        const code = ch.codePointAt(0) ?? 0;
        if (ch === '\\') out += '\\\\';
        else if (ch === '{') out += '\\{';
        else if (ch === '}') out += '\\}';
        else if (code > 127) out += `\\u${code > 0x7fff ? code - 0x10000 : code}?`;
        else out += ch;
      }
      return out;
    };
    const titleBlock = [
      `{\\b\\fs36 ${escapeRtfLocal(project.title)}}\\par`,
      ...(project.intro ? [`${escapeRtfLocal(project.intro)}\\par`, '\\par'] : []),
    ].join('\n');
    const [head, ...rest] = text.split('\n');
    return [head, titleBlock, ...rest].join('\n');
  }

  const header =
    format === 'md'
      ? `# ${project.title}\n\n${project.intro ? `> ${project.intro}\n\n` : ''}`
      : buildFormat === 'html'
        ? [
            '<!DOCTYPE html>',
            '<html lang="zh-CN"><head><meta charset="utf-8">',
            `<title>${escapeHtml(project.title)}</title>`,
            '</head><body>',
            `<h1>${escapeHtml(project.title)}</h1>`,
            project.intro ? `<p class="intro">${escapeHtml(project.intro)}</p>` : '',
          ].join('\n')
        : `${i18n.t('writing:export.bookTitleTxt', { title: project.title })}\n\n${project.intro ? `${i18n.t('writing:export.introLabel')}${project.intro}\n\n` : ''}`;

  if (buildFormat === 'html') {
    return `${header}${text}\n</body></html>`;
  }
  return `${header}${text}\n\n`;
};

/**
 * 出版文件集：HTML 管线产出 → ePub / DOCX / ODT 文件映射（主进程 STORE 打包）。
 */
export const buildExportPackage = (
  project: Project,
  selectedChapterIds: Set<string>,
  format: 'epub' | 'docx' | 'odt',
  profileOverride?: BuildProfile,
  compileOptions?: ExportCompileOptions,
): Record<string, string> => {
  const fullHtml = buildExportContent(project, selectedChapterIds, 'html', profileOverride, compileOptions);
  // 取 body 内层，避免 html/head/body 嵌套进出版文件；
  // 再剥掉管线自带的书名 h1 与简介 intro（打包器按 project 统一重加）
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const chaptersOnly = (bodyMatch?.[1] ?? fullHtml)
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '')
    .replace(/<p class="intro">[\s\S]*?<\/p>/i, '')
    .trim();
  const input = { title: project.title, intro: project.intro, htmlBody: chaptersOnly };
  if (format === 'epub') return buildEpubFiles(input);
  if (format === 'docx') return buildDocxFiles(input);
  return buildOdtFiles(input);
};
