/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 通用文本文件选择：桌面端经主进程「打开」对话框读取，浏览器/开发模式回退到
 * 隐藏的 <input type="file">。取消返回 null，读取失败返回 null（调用方无需区分）。
 */
export interface PickTextFileOptions {
  /** 对话框标题。 */
  title: string;
  /** 文件类型显示名。 */
  filterName: string;
  /** 扩展名，不含点，如 `canvas`。 */
  extension: string;
}

function pickWithInput(options: PickTextFileOptions): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise<string | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.${options.extension}`;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(resolve, () => resolve(null));
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export async function pickTextFile(options: PickTextFileOptions): Promise<string | null> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (api?.openFileDialog && api.readFile) {
    const result = await api.openFileDialog({
      title: options.title,
      filters: [{ name: options.filterName, extensions: [options.extension] }],
      properties: ['openFile'],
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;
    return api.readFile(filePath);
  }
  return pickWithInput(options);
}
