/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

import type { SandboxRunRequest } from '../../shared/sandbox.js';
import { registerLocalInferenceIpc, shutdownLocalRuntime } from '../ai/localRuntime.js';
import { IPC } from '../channels.js';
import { closeMcpClients,registerMcpClientIpc } from '../mcp/clientIpc.js';
import { registerPluginNetIpc } from '../net/pluginNet.js';
import { registerProxyIpc } from '../net/proxyIpc.js';
import { closeSqlite,registerSqliteIpc } from '../sqlite-ipc.js';
import { registerSyncIpc } from '../sync/transportIpc.js';
import { registerUpdaterIpc } from '../updater.js';
import { registerVectorIpc } from '../vector-ipc.js';
import type { Provider, ProviderContext } from './container.js';
import { crashSubmitUrl, readCrashReportingConfig, writeCrashReportingConfig } from './crashReportConfig.js';
import { registerDiagnosticsIpc } from './diagnostics.js';
import { extractPdfText } from './documents.js';
import { allowPath, allowRoot, assertPathAllowed } from './fsAccess.js';
import { registerPluginFsIpc } from './pluginFs.js';
import { sandboxHost } from './pluginSandbox/host.js';
import { type CosignVerifyInput, sha256Matches, verifyCosignBlob,verifyEd25519 } from './pluginSignature.js';
import { registerPluginStoreIpc } from './pluginStoreIpc.js';
import { isTrustedPluginKey, listTrustedPluginKeys, setTrustedPluginKeys } from './pluginTrust.js';
import { destroyTray, registerShellIpc } from './tray.js';
import { applyWindowSecurity, createWindow, getMainWindow } from './window.js';

/**
 * 主进程各子系统的 Provider 化（docs/design/02）。
 * 每个 Provider 的 boot 即原 main.ts 里的一次 registerXxxIpc / createWindow 调用，
 * 行为与 IPC 契约完全不变，只是纳入统一生命周期。
 */

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`Invalid ${label}: expected non-empty string`);
  }
}

/** 窗口 Provider：创建主窗口。置于最后 boot（IPC 先就绪），最先 shutdown 无操作。 */
export const windowProvider: Provider = {
  name: 'window',
  boot() {
    void createWindow();
    app.on('activate', () => {
      const win = getMainWindow();
      if (!win) {
        void createWindow();
        return;
      }
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    });
  },
};

/** 文件系统 Provider：本地优先工具，导入/导出允许用户选任意路径，仅校验入参类型。 */
export const fileProvider: Provider = {
  name: 'file',
  boot(ctx: ProviderContext) {
    // 默认只允许 userData；其余根经 fs:allow-path 注册或对话框返回时自动授权
    allowRoot(app.getPath('userData'));
    ipcMain.handle(IPC.getAppDataPath, () => app.getPath('userData'));
    ipcMain.handle(IPC.allowPath, async (_event, dirPath: string) => {
      assertString(dirPath, 'dirPath');
      const stat = await fs.stat(dirPath).catch(() => null);
      if (!stat?.isDirectory()) throw new Error(`路径不是目录：${dirPath}`);
      allowRoot(dirPath);
      return true;
    });

    ipcMain.handle(IPC.readFile, async (_event, filePath: string) => {
      assertString(filePath, 'filePath');
      assertPathAllowed(filePath);
      try {
        return await fs.readFile(filePath, 'utf-8');
      } catch (error) {
        // 轮询型读方（如 MCP 提案桥）常态读不存在的文件：ENOENT 静默返回空串，其余照抛
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
        throw error;
      }
    });

    ipcMain.handle(IPC.writeFile, async (_event, filePath: string, data: string) => {
      assertString(filePath, 'filePath');
      assertPathAllowed(filePath);
      if (typeof data !== 'string') {
        throw new TypeError('Invalid data: expected string');
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data, 'utf-8');
      return true;
    });

    ipcMain.handle(IPC.appendFile, async (_event, filePath: string, data: string) => {
      assertString(filePath, 'filePath');
      assertPathAllowed(filePath);
      if (typeof data !== 'string') {
        throw new TypeError('Invalid data: expected string');
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, data, 'utf-8');
      return true;
    });

    ipcMain.handle(IPC.writeBinaryFile, async (_event, filePath: string, base64: string) => {
      assertString(filePath, 'filePath');
      assertString(base64, 'base64');
      assertPathAllowed(filePath);
      // 只接受标准 base64，解码后落二进制（封面 PNG 等）
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
        throw new TypeError('Invalid base64 payload');
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
      return true;
    });

    ipcMain.handle(IPC.extractPdfText, async (_event, base64: string) => {
      assertString(base64, 'base64');
      return extractPdfText(base64);
    });

    ipcMain.handle(IPC.fileExists, async (_event, filePath: string) => {
      assertString(filePath, 'filePath');
      assertPathAllowed(filePath);
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    });

    ipcMain.handle(IPC.listDirectory, async (_event, dirPath: string) => {
      assertString(dirPath, 'dirPath');
      assertPathAllowed(dirPath);
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? ('directory' as const) : ('file' as const) }));
      } catch {
        return [];
      }
    });

    registerPluginFsIpc();
    ipcMain.handle(IPC.pluginSandboxRun, (_event, request: SandboxRunRequest) => sandboxHost.run(request));
    // 插件编辑器 iframe 的受控联网：仅 https，主进程代理（15s 超时、截断 200KB）
    ipcMain.handle(IPC.pluginFetch, async (_event, url: string) => {
      if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
        throw new TypeError('Invalid url');
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { ok: false as const, error: '非法 URL' };
      }
      if (parsed.protocol !== 'https:') return { ok: false as const, error: '插件联网仅允许 https' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
        const text = (await res.text()).slice(0, 200_000);
        return { ok: true as const, status: res.status, text };
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
      } finally {
        clearTimeout(timer);
      }
    });
    ipcMain.handle(
      IPC.pluginVerifySignature,
      (_event, contentBase64: string, signatureBase64: string, publicKeyPem: string) => {
        // 主进程持有信任清单：不在清单内的公钥一律拒绝，渲染层不得自定锚点。
        if (typeof publicKeyPem !== 'string' || !isTrustedPluginKey(publicKeyPem)) {
          return false;
        }
        return verifyEd25519(Buffer.from(contentBase64, 'base64'), signatureBase64, publicKeyPem);
      },
    );
    ipcMain.handle(IPC.pluginTrustedKeysSync, (_event, keys: unknown) => {
      if (!Array.isArray(keys)) throw new TypeError('Invalid keys');
      setTrustedPluginKeys(keys.filter((key): key is string => typeof key === 'string'));
      return { ok: true };
    });
    ipcMain.handle(IPC.pluginTrustedKeysList, () => listTrustedPluginKeys());
    ipcMain.handle(IPC.pluginDigestMatches, (_event, contentBase64: string, digestBase64: string) =>
      sha256Matches(Buffer.from(contentBase64, 'base64'), digestBase64),
    );
    ipcMain.handle(
      IPC.pluginCosignVerify,
      (_event, contentBase64: string, envelope: CosignVerifyInput) =>
        verifyCosignBlob(Buffer.from(contentBase64, 'base64'), envelope),
    );
    ipcMain.handle(IPC.crashGetConfig, () => ({
      enabled: readCrashReportingConfig().enabled,
      configured: !!crashSubmitUrl(),
    }));
    ipcMain.handle(IPC.crashSetEnabled, (_event, enabled: boolean) => {
      writeCrashReportingConfig({ enabled: enabled === true });
      return { restartRequired: true };
    });

    // 系统文件管理器打开路径（日志/数据目录入口；只允许 userData 内路径）
    ipcMain.handle(IPC.openPath, async (_event, targetPath: string) => {
      assertString(targetPath, 'targetPath');
      const base = path.resolve(app.getPath('userData'));
      const resolved = path.resolve(targetPath);
      if (resolved !== base && !resolved.startsWith(base + path.sep)) {
        throw new Error('拒绝打开应用数据目录外的路径');
      }
      const err = await shell.openPath(resolved);
      if (err) throw new Error(err);
      return true;
    });

    // 外部浏览器打开链接（仅 https；渲染层 window.open 被安全策略拒绝，走这里）
    ipcMain.handle(IPC.openExternal, async (_event, url: string) => {
      assertString(url, 'url');
      if (!/^https:\/\/[^/]+\//.test(url)) {
        throw new Error('只允许打开 https 链接');
      }
      await shell.openExternal(url);
      return true;
    });

    // 打包导出：文件集 → STORE zip → 原生另存为（ePub/DOCX 复用 HTML 管线产出）
    ipcMain.handle(IPC.exportPackage, async (_event, files: unknown, defaultPath: string) => {
      if (typeof files !== 'object' || files === null || typeof defaultPath !== 'string') {
        throw new TypeError('Invalid exportPackage args');
      }
      const entries = Object.entries(files as Record<string, unknown>);
      if (entries.length === 0 || entries.length > 500) {
        throw new Error('文件集为空或过大');
      }
      const clean: Record<string, string> = {};
      for (const [name, content] of entries) {
        if (typeof content !== 'string' || content.length > 20_000_000) {
          throw new Error(`非法文件内容：${name}`);
        }
        const normalized = name.replace(/\\/g, '/');
        if (
          normalized.length === 0 ||
          normalized.includes('..') ||
          normalized.startsWith('/') ||
          /^[a-zA-Z]:/.test(normalized) ||
          path.isAbsolute(name)
        ) {
          throw new Error(`非法文件名：${name}`);
        }
        clean[name] = content;
      }
      const { zipStore } = await import('../../core/build/zipStore.js');
      const zip = zipStore(clean);
      const saveOptions = {
        title: '导出文件',
        defaultPath,
        filters: [{ name: 'Package', extensions: [defaultPath.split('.').pop() ?? 'zip'] }],
      };
      const parent = ctx.getMainWindow();
      const target = parent
        ? await dialog.showSaveDialog(parent, saveOptions)
        : await dialog.showSaveDialog(saveOptions);
      if (target.canceled || !target.filePath) return { canceled: true };
      allowPath(target.filePath);
      await fs.mkdir(path.dirname(target.filePath), { recursive: true });
      await fs.writeFile(target.filePath, zip);
      return { canceled: false };
    });

    ipcMain.handle(IPC.deleteFile, async (_event, filePath: string) => {
      assertString(filePath, 'filePath');
      assertPathAllowed(filePath);
      await fs.unlink(filePath);
      return true;
    });

    registerDiagnosticsIpc(ctx.getMainWindow);
  },
};

/** 对话框 Provider：以主窗口为父窗口。 */
export const dialogProvider: Provider = {
  name: 'dialog',
  boot(ctx: ProviderContext) {
    ipcMain.handle(IPC.openFileDialog, async (_event, options: Electron.OpenDialogOptions) => {
      const win = ctx.getMainWindow();
      const result = win ? await dialog.showOpenDialog(win, options ?? {}) : await dialog.showOpenDialog(options ?? {});
      result.filePaths.forEach(allowPath);
      return result;
    });

    ipcMain.handle(IPC.saveFileDialog, async (_event, options: Electron.SaveDialogOptions) => {
      const win = ctx.getMainWindow();
      const result = win ? await dialog.showSaveDialog(win, options ?? {}) : await dialog.showSaveDialog(options ?? {});
      if (!result.canceled && result.filePath) allowPath(result.filePath);
      return result;
    });

    ipcMain.handle(IPC.openDirectoryDialog, async (_event, options: Electron.OpenDialogOptions) => {
      const merged: Electron.OpenDialogOptions = {
        title: '选择目录',
        properties: ['openDirectory', 'createDirectory'],
        ...options,
      };
      const win = ctx.getMainWindow();
      const result = win ? await dialog.showOpenDialog(win, merged) : await dialog.showOpenDialog(merged);
      result.filePaths.forEach(allowPath);
      return result;
    });

    // HTML 打印为 PDF：隐藏窗口渲染 → 原生另存为 → 二进制落盘（渲染层不碰二进制）
    ipcMain.handle(IPC.printPdf, async (_event, html: string, defaultPath: string) => {
      if (typeof html !== 'string' || typeof defaultPath !== 'string') {
        throw new TypeError('Invalid printPdf args');
      }
      const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
      applyWindowSecurity(win);
      try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        const pdf = await win.webContents.printToPDF({ printBackground: true });
        const target = await dialog.showSaveDialog(ctx.getMainWindow() ?? win, {
          title: '导出 PDF',
          defaultPath,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (target.canceled || !target.filePath) return { canceled: true };
        allowPath(target.filePath);
        await fs.mkdir(path.dirname(target.filePath), { recursive: true });
        await fs.writeFile(target.filePath, pdf);
        return { canceled: false };
      } finally {
        win.destroy();
      }
    });
  },
};

/** 向量存储 Provider：主进程代理 vectra 集合。 */
export const vectorProvider: Provider = {
  name: 'vector',
  boot() {
    registerVectorIpc();
  },
};

/** SQLite 数据引擎 Provider：better-sqlite3 连接，退出时关闭。 */
export const sqliteProvider: Provider = {
  name: 'sqlite',
  boot() {
    registerSqliteIpc();
  },
  shutdown() {
    closeSqlite();
  },
};

/** MCP 客户端 Provider：外部 server 的 stdio 连接，退出时关闭子进程。 */
export const mcpClientProvider: Provider = {
  name: 'mcp-client',
  boot() {
    registerMcpClientIpc();
  },
  shutdown() {
    void closeMcpClients();
  },
};

/** 网络代理 Provider：代理下发与连通测试（网关 + Chromium 双覆盖）。 */
export const netProvider: Provider = {
  name: 'net',
  boot() {
    registerProxyIpc();
  },
};

/** 同步传输 Provider：本地目录 / WebDAV / S3 的连通测试与对象收发。 */
export const syncProvider: Provider = {
  name: 'sync',
  boot() {
    registerSyncIpc();
  },
};

/** 系统壳 Provider：托盘常驻 + 开机自启/最小化设置；退出时销毁托盘。 */
export const shellProvider: Provider = {
  name: 'shell',
  boot(ctx: ProviderContext) {
    registerShellIpc(ctx.getMainWindow);
  },
  shutdown() {
    destroyTray();
  },
};

/** 自动更新 Provider：打包版注册原生更新 IPC（开发版空操作）。 */
export const updaterProvider: Provider = {
  name: 'updater',
  boot() {
    registerUpdaterIpc();
  },
};

/** 插件安装 Provider：目录索引安装/卸载 + 受控网络门（白名单 + 默认拒绝）。 */
export const pluginStoreProvider: Provider = {
  name: 'plugin-store',
  boot() {
    registerPluginStoreIpc();
    registerPluginNetIpc();
  },
};

/** 本地推理 Provider：进程管理 + 端点探测；退出时停止托管进程。 */
export const localInferenceProvider: Provider = {
  name: 'local-inference',
  boot() {
    registerLocalInferenceIpc();
  },
  shutdown() {
    shutdownLocalRuntime();
  },
};
