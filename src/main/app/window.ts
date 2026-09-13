/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow } from 'electron';

import { logger } from '../logger.js';
import { interceptClose } from './tray.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 开发服务器候选端口（与 vite.config.ts 的 5199 及并发实例回退保持一致） */
const DEV_SERVER_PORTS = [5199, 5200, 5201, 5202];

const LOAD_ERROR_HTML = [
  '<html><body style="font-family:Arial;padding:40px;text-align:center;">',
  '<h1>加载失败</h1>',
  '<p>无法加载应用程序文件。请检查 build/renderer 目录是否存在，或重新运行 npm run build。</p>',
  '</body></html>',
].join('');

let mainWindow: BrowserWindow | null = null;

/** 窗口几何记忆：userData/window-state.json，损坏回退默认尺寸。 */
const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_BOUNDS = { width: 1400, height: 900 };

function stateFile(): string {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

async function loadBounds(): Promise<{ width: number; height: number; x?: number; y?: number; maximized: boolean }> {
  try {
    const raw = await import('node:fs/promises').then((fs) => fs.readFile(stateFile(), 'utf-8'));
    const parsed = JSON.parse(raw) as { width?: number; height?: number; x?: number; y?: number; maximized?: boolean };
    const width = Math.max(1200, Math.min(3840, Number(parsed.width) || DEFAULT_BOUNDS.width));
    const height = Math.max(800, Math.min(2160, Number(parsed.height) || DEFAULT_BOUNDS.height));
    return {
      width, height,
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
      maximized: parsed.maximized === true,
    };
  } catch {
    return { ...DEFAULT_BOUNDS, maximized: false };
  }
}

async function saveBounds(win: BrowserWindow): Promise<void> {
  try {
    const { default: fs } = await import('node:fs/promises');
    const maximized = win.isMaximized();
    const b = win.getBounds();
    await fs.writeFile(stateFile(), JSON.stringify(maximized ? { ...DEFAULT_BOUNDS, maximized: true } : { ...b, maximized: false }));
  } catch (err: unknown) {
    logger.warn('window', 'Failed to save window bounds', err);
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function applyWindowSecurity(win: BrowserWindow): void {
  // 拒绝一切弹出新窗口的行为（渲染层没有合法使用场景）
  win.webContents.setWindowOpenHandler(({ url }) => {
    logger.warn('window', `Blocked window.open: ${url}`);
    return { action: 'deny' };
  });

  // 阻止偏离预期来源的导航（防止被诱导跳转到外部站点）
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = app.isPackaged
      ? url.startsWith('file:')
      : /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
    if (!allowed) {
      event.preventDefault();
      logger.warn('window', `Blocked navigation to: ${url}`);
    }
  });
}

function tryDevelopmentServer(win: BrowserWindow, portIndex = 0): void {
  if (portIndex >= DEV_SERVER_PORTS.length) {
    logger.error('window', 'All development server ports failed');
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(LOAD_ERROR_HTML)}`).catch(() => undefined);
    return;
  }
  const port = DEV_SERVER_PORTS[portIndex] as number;
  const devServerURL = `http://localhost:${port}`;
  logger.info('window', `Trying development server: ${devServerURL}`);
  win.loadURL(devServerURL).catch((err: unknown) => {
    logger.warn('window', `Dev server on port ${port} unavailable, trying next`, err);
    setTimeout(() => tryDevelopmentServer(win, portIndex + 1), 100);
  });
}

export async function createWindow(): Promise<void> {
  const saved = await loadBounds();
  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, '../../preload/preload.js'),
    },
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '../../../../src/assets/icon.png'),
    titleBarStyle: 'default',
    autoHideMenuBar: true,
  });

  applyWindowSecurity(mainWindow);
  if (saved.maximized) mainWindow.maximize();

  // 关闭/退出前落盘几何，下次原样恢复；最小化到托盘开启时关闭即隐藏
  const persist = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) void saveBounds(mainWindow);
  };
  mainWindow.on('close', (event) => {
    persist();
    if (interceptClose() && mainWindow && !mainWindow.isDestroyed()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (app.isPackaged) {
    const indexPath = path.join(__dirname, '../../../renderer/index.html');
    mainWindow.loadFile(indexPath).catch((err: unknown) => {
      logger.error('window', 'Failed to load index.html', err);
      mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(LOAD_ERROR_HTML)}`).catch(() => undefined);
    });
  } else {
    tryDevelopmentServer(mainWindow);
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}
