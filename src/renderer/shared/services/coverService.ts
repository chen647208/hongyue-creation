/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 封面导出（docs/design/16）：core 产出 SVG → 渲染端光栅化为 PNG 另存；canvas/Image
 * 不可用（测试/无 DOM）时退回另存 SVG。
 */

import { buildCoverSvg, type CoverOptions } from '@core/build';

import { dt } from '@/i18n';

import type { Project } from '../../../shared/types';

type ElectronAPI = NonNullable<Window['electronAPI']>;

function api(): ElectronAPI | undefined {
  return typeof window !== 'undefined' ? window.electronAPI : undefined;
}

/** SVG → PNG dataURL（1024×1365）。无 Image/canvas 时 reject，由调用方退回 SVG。 */
export function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      reject(new Error('no-canvas'));
      return;
    }
    const img = new Image();
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no-ctx');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('svg-load-failed'));
    img.src = svgUrl;
  });
}

/** 一本书的封面参数（标题 + 简介首句 + 印记）。 */
export function coverOptionsFor(book: Pick<Project, 'title' | 'intro'>): CoverOptions {
  const subtitle = (book.intro ?? '').split(/[\n。！？.!?]/)[0]?.trim();
  return { title: book.title, subtitle: subtitle || undefined, imprint: dt('common:appName') };
}

/** 导出封面：优先 PNG，失败退回 SVG。桌面端另存为，网页端下载。 */
export async function exportCover(book: Pick<Project, 'title' | 'intro'>): Promise<{ canceled: boolean; path?: string; format: 'png' | 'svg' }> {
  const options = coverOptionsFor(book);
  const svg = buildCoverSvg(options);
  const a = api();
  const safeTitle = book.title.replace(/[\\/:*?"<>|]/g, '_') || 'cover';

  // 先尝试 PNG
  let pngBase64: string | null;
  try {
    const dataUrl = await svgToPngDataUrl(svg, 1024, 1365);
    pngBase64 = dataUrl.split(',')[1] ?? null;
  } catch {
    pngBase64 = null;
  }

  if (a && pngBase64) {
    const target = await a.saveFileDialog({
      title: dt('app:cover.exportTitle'),
      defaultPath: `${safeTitle}-cover.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (target.canceled || !target.filePath) return { canceled: true, format: 'png' };
    await a.writeBinaryFile(target.filePath, pngBase64);
    return { canceled: false, path: target.filePath, format: 'png' };
  }

  // SVG 回退
  const fileName = `${safeTitle}-cover.svg`;
  if (a) {
    const target = await a.saveFileDialog({
      title: dt('app:cover.exportTitle'),
      defaultPath: fileName,
      filters: [{ name: 'SVG', extensions: ['svg'] }],
    });
    if (target.canceled || !target.filePath) return { canceled: true, format: 'svg' };
    await a.writeFile(target.filePath, svg);
    return { canceled: false, path: target.filePath, format: 'svg' };
  }
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = fileName;
  el.click();
  URL.revokeObjectURL(url);
  return { canceled: false, format: 'svg' };
}
