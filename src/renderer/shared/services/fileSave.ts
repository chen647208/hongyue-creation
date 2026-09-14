/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 通用文本文件保存：桌面端经主进程「另存为」对话框写入用户选择的路径，
 * 浏览器/开发模式回退到 <a download>。渲染层不拼任意路径。
 */
export interface SaveTextFileOptions {
  /** MIME 类型（浏览器回退用），如 `text/csv`。 */
  mime: string;
  /** 扩展名，不含点，如 `csv`。 */
  extension: string;
  /** 对话框文件类型显示名。 */
  filterName: string;
  /** 对话框标题。 */
  dialogTitle: string;
}

export async function saveTextFile(filename: string, content: string, options: SaveTextFileOptions): Promise<void> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (api?.saveFileDialog && api?.writeFile) {
    const result = await api.saveFileDialog({
      title: options.dialogTitle,
      defaultPath: filename,
      filters: [{ name: options.filterName, extensions: [options.extension] }],
    });
    if (result.canceled || !result.filePath) return;
    await api.writeFile(result.filePath, content);
    return;
  }
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: `${options.mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
