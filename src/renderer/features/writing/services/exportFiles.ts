/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 导出落盘：文件名、扩展名、另存为与浏览器下载回退。
 * 不依赖构建管线；导出对话框与落盘编排按需引用。
 */
import { i18n } from '@/i18n';

import type { ExportFormat } from '../types';

// 键为导出格式 id：内置 8 格式之外，插件渲染器可声明新格式（查表未命中时见 exportFileExtension）。
const EXPORT_EXT: Record<string, string> = { txt: 'txt', md: 'md', html: 'html', rtf: 'rtf', pdf: 'pdf', epub: 'epub', docx: 'docx', odt: 'odt' };
const EXPORT_MIME: Record<string, string> = { txt: 'text/plain', md: 'text/markdown', html: 'text/html', rtf: 'application/rtf', pdf: 'application/pdf', epub: 'application/epub+zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text' };

/** 导出格式 → 文件扩展名：内置格式按表取值，插件渲染器声明的新格式用格式 id 本身。 */
export function exportFileExtension(format: ExportFormat): string {
  return EXPORT_EXT[format] ?? format;
}

export const buildExportFilename = (projectTitle: string, format: ExportFormat = 'txt', now: Date = new Date()) => {
  const safeTitle = projectTitle.replace(/[\\/:*?"<>|]/g, '_');
  return `${safeTitle}_${i18n.t('writing:export.fileSuffix')}_${now.toISOString().split('T')[0]}.${exportFileExtension(format)}`;
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
      filters: [{ name: i18n.t('writing:export.fileFilterName'), extensions: [exportFileExtension(format)] }],
    });
    if (result.canceled || !result.filePath) return; // 用户取消
    await api.writeFile(result.filePath, content);
    return;
  }
  downloadTextFile(filename, content, EXPORT_MIME[format]);
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
