/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { buildDocxFiles, buildEpubFiles, buildOdtFiles, type BuildProfile,clampHeadingLevel, COMPILE_DEFAULTS, referenceEntities,roundtripProfile, runBuild } from '@core/build';
import type { AttributeEntity, EdgeEntity,NodeEntity } from '@core/entities';
import { Bot, Brain, Cpu, Feather, type LucideIcon,Server } from 'lucide-react';

import { i18n } from '@/i18n';

import type { AIHistoryRecord, Chapter, Project } from '../../../shared/types';
import {
  FLOATING_MENU_HEIGHT,
  FLOATING_MENU_OFFSET_X,
  FLOATING_MENU_OFFSET_Y,
  FLOATING_MENU_VIEWPORT_MARGIN,
  FLOATING_MENU_WIDTH,
  MAX_CHAPTER_CONTEXT_LENGTH,
  MAX_PREVIOUS_CHAPTER_SUMMARIES,
} from './constants';
import type { ExportCompileOptions,ExportFormat,TextSelectionRange, TokenUsage } from './types';

export const debounce = <Args extends unknown[]>(func: (...args: Args) => void, wait: number) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export const getChapterContext = (chapters: Chapter[], currentChapter: Chapter) => {
  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
  const currentIndex = sortedChapters.findIndex((chapter) => chapter.id === currentChapter.id);
  const previousChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] ?? null : null;
  const previousContent = previousChapter?.content?.trim() || '';
  const previousContextText = previousContent.length > MAX_CHAPTER_CONTEXT_LENGTH
    ? `...${previousContent.slice(-MAX_CHAPTER_CONTEXT_LENGTH)}`
    : previousContent;
  const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] ?? null : null;
  const nextSummary = nextChapter?.summary?.trim() || '';

  return {
    prevChapter: previousChapter,
    prevContextText: previousContextText,
    nextChapter,
    nextSummary,
  };
};

export const toggleSetValue = (source: Set<string>, value: string) => {
  const next = new Set(source);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
};

export const getPreviousChapterSummaryIds = (chapters: Chapter[], currentChapter: Chapter | null | undefined) => {
  if (!currentChapter) {
    return new Set<string>();
  }

  const sortedChapters = [...chapters].sort((a, b) => a.order - b.order);
  const currentIndex = sortedChapters.findIndex((chapter) => chapter.id === currentChapter.id);
  const previousChapters = sortedChapters.slice(Math.max(0, currentIndex - MAX_PREVIOUS_CHAPTER_SUMMARIES), currentIndex);

  return new Set(
    previousChapters
      .filter((chapter) => chapter.contentSummary && chapter.contentSummary.trim().length > 0)
      .map((chapter) => chapter.id),
  );
};

/** Project.chapters → 构建管线实体视图（导出与统计共用，单一口径）。 */export function projectToBuildEntities(project: Project): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  const nodes: NodeEntity[] = project.chapters.map((c) => ({
    id: c.id,
    bookId: project.id,
    type: 'novel.chapter',
    title: c.title,
    body: c.content || i18n.t('writing:export.noContent'),
    createdAt: 0,
    updatedAt: 0,
    erased: false,
  }));
  const attrs: AttributeEntity[] = project.chapters.flatMap((c) => {
    const list: AttributeEntity[] = [{
      id: `attr-order-${c.id}`,
      nodeId: c.id,
      type: 'label',
      name: 'order',
      value: String(c.order),
      inheritable: false,
      position: 0,
      erased: false,
    }];
    if (c.material) {
      list.push({
        id: `attr-material-${c.id}`,
        nodeId: c.id,
        type: 'label',
        name: 'material',
        value: 'true',
        inheritable: false,
        position: 1,
        erased: false,
      });
    }
    return list;
  });
  // 来源条目投影为 meta.reference 节点：正文 [@key] 经编译管线解析为编号与文末表。
  const sources = referenceEntities(project.references ?? [], project.id);
  return { nodes: [...nodes, ...sources.nodes], attrs: [...attrs, ...sources.attrs], edges: [] };
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * 把导出对话框的编译覆盖项叠加到档案上：素材口径、目录、标题层级、章节范围。
 * 深拷贝后修改，不改动内置档案；范围两端都为空时清除 range。
 */
export const applyExportCompileOptions = (profile: BuildProfile, options: ExportCompileOptions): BuildProfile => {
  const next = roundtripProfile(profile);
  next.selection = { ...next.selection, materialPolicy: options.materialPolicy };
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

  const { text } = runBuild(profile, { nodes, attrs, edges: [] });

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

const EXPORT_EXT: Record<ExportFormat, string> = { txt: 'txt', md: 'md', html: 'html', rtf: 'rtf', pdf: 'pdf', epub: 'epub', docx: 'docx', odt: 'odt' };
const EXPORT_MIME: Record<ExportFormat, string> = { txt: 'text/plain', md: 'text/markdown', html: 'text/html', rtf: 'application/rtf', pdf: 'application/pdf', epub: 'application/epub+zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text' };

export const buildExportFilename = (projectTitle: string, format: ExportFormat = 'txt', now: Date = new Date()) => {
  const safeTitle = projectTitle.replace(/[\\/:*?"<>|]/g, '_');
  return `${safeTitle}_${i18n.t('writing:export.fileSuffix')}_${now.toISOString().split('T')[0]}.${EXPORT_EXT[format]}`;
};

/**
 * 保存导出文件：Electron 环境优先用原生"另存为"对话框写入用户选择的路径，
 * 浏览器/开发模式下回退到 <a download>。
 */
export const saveExportFile = async (filename: string, content: string, format: ExportFormat): Promise<void> => {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  // PDF：主进程隐藏窗口渲染打印（渲染层不碰二进制）；Web 回退浏览器打印（用户选存为 PDF）
  if (format === 'pdf') {
    if (api?.printPdf) {
      await api.printPdf(content, filename);
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    // 用 DOMParser 写入替代已废弃的 document.write：保留内联样式，脚本不执行（仅打印用）
    const doc = printWindow.document;
    const parsed = new DOMParser().parseFromString(content, 'text/html');
    doc.replaceChild(doc.importNode(parsed.documentElement, true), doc.documentElement);
    printWindow.focus();
    printWindow.print();
    return;
  }
  // ePub/DOCX/ODT：调用方传文件集（buildExportPackage），此处只负责保存
  if (format === 'epub' || format === 'docx' || format === 'odt') {
    throw new Error('ePub/DOCX/ODT 请走 savePackageFile（需文件集）');
  }
  if (api?.saveFileDialog && api?.writeFile) {
    const result = await api.saveFileDialog({
      title: i18n.t('writing:export.fileDialogTitle'),
      defaultPath: filename,
      filters: [{ name: i18n.t('writing:export.fileFilterName'), extensions: [EXPORT_EXT[format]] }],
    });
    if (result.canceled || !result.filePath) return; // 用户取消
    await api.writeFile(result.filePath, content);
    return;
  }
  downloadTextFile(filename, content, EXPORT_MIME[format]);
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

/**
 * 保存出版包：Electron 走主进程打包另存；Web 回退下载同名 HTML 源。
 */
export const savePackageFile = async (
  filename: string,
  files: Record<string, string>,
  format: 'epub' | 'docx' | 'odt',
  fallbackHtml: string,
): Promise<void> => {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (api?.exportPackage) {
    await api.exportPackage(files, filename);
    return;
  }
  downloadTextFile(filename.replace(/\.(epub|docx|odt)$/, '.html'), fallbackHtml, 'text/html');
};

export const downloadTextFile = (filename: string, content: string, mime = 'text/plain') => {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const getFloatingMenuPosition = (x: number, y: number) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let nextX = x + FLOATING_MENU_OFFSET_X;
  let nextY = y + FLOATING_MENU_OFFSET_Y;

  if (nextX + FLOATING_MENU_WIDTH > viewportWidth - FLOATING_MENU_VIEWPORT_MARGIN) {
    nextX = viewportWidth - FLOATING_MENU_WIDTH - FLOATING_MENU_VIEWPORT_MARGIN;
  } else if (nextX < FLOATING_MENU_VIEWPORT_MARGIN) {
    nextX = FLOATING_MENU_VIEWPORT_MARGIN;
  }

  if (nextY + FLOATING_MENU_HEIGHT > viewportHeight - FLOATING_MENU_VIEWPORT_MARGIN) {
    nextY = viewportHeight - FLOATING_MENU_HEIGHT - FLOATING_MENU_VIEWPORT_MARGIN;
  } else if (nextY < FLOATING_MENU_VIEWPORT_MARGIN) {
    nextY = FLOATING_MENU_VIEWPORT_MARGIN;
  }

  return { x: nextX, y: nextY };
};

export const isSelectionAvailable = (range: TextSelectionRange | null) => {
  return !!range && range.end > range.start;
};

export const formatHistoryTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const formatTokenUsage = (tokens?: TokenUsage) => {
  if (!tokens) {
    return 'N/A';
  }
  return i18n.t('writing:utils.tokenUsage', { input: tokens.prompt, output: tokens.completion, total: tokens.total });
};

export const getProviderIcon = (provider: string): { icon: LucideIcon; cls: string } => {
  switch (provider) {
    case 'gemini':
      return { icon: Bot, cls: 'text-chart-1' };
    case 'ollama':
      return { icon: Server, cls: 'text-chart-5' };
    case 'anthropic':
      return { icon: Feather, cls: 'text-chart-6' };
    case 'openai-responses':
      return { icon: Brain, cls: 'text-chart-4' };
    case 'openai-chat':
      return { icon: Brain, cls: 'text-chart-4' };
    default:
      return { icon: Cpu, cls: 'text-chart-gray' };
  }
};

export const getGenerationType = (record: AIHistoryRecord) => {
  // 模板名匹配基于项目数据中存储的中文模板名（数据值），保持字面
  if (record.metadata?.batchGeneration) {
    return i18n.t('writing:utils.genTypeBatch');
  }
  if (record.metadata?.templateName?.includes('润色') || record.metadata?.templateName?.includes('扩写')) {
    return i18n.t('writing:utils.genTypePolish');
  }
  return i18n.t('writing:utils.genTypeContent');
};

