/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { contextBridge, ipcRenderer } from 'electron';

import { IPC } from './channels.js';

/**
 * preload：以语义化方法暴露主进程能力。
 * 渲染进程拿不到 ipcRenderer / Node API，所有通道名集中来自 channels.ts。
 * 注意：本文件编译为 CommonJS（沙箱化 preload 环境要求）。
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 文件系统操作
  getAppDataPath: () => ipcRenderer.invoke(IPC.getAppDataPath),
  allowPath: (dirPath: string) => ipcRenderer.invoke(IPC.allowPath, dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke(IPC.readFile, filePath),
  writeFile: (filePath: string, data: string) => ipcRenderer.invoke(IPC.writeFile, filePath, data),
  appendFile: (filePath: string, data: string) => ipcRenderer.invoke(IPC.appendFile, filePath, data),
  writeBinaryFile: (filePath: string, base64: string) => ipcRenderer.invoke(IPC.writeBinaryFile, filePath, base64),
  extractPdfText: (base64: string) => ipcRenderer.invoke(IPC.extractPdfText, base64),
  onFlushRequest: (listener: () => void) => {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.flushRequest, handler);
    return () => ipcRenderer.removeListener(IPC.flushRequest, handler);
  },
  notifyFlushDone: () => ipcRenderer.send(IPC.flushDone),
  exists: (filePath: string) => ipcRenderer.invoke(IPC.fileExists, filePath),
  unlink: (filePath: string) => ipcRenderer.invoke(IPC.deleteFile, filePath),

  // 对话框
  openFileDialog: (options: unknown) => ipcRenderer.invoke(IPC.openFileDialog, options),
  saveFileDialog: (options: unknown) => ipcRenderer.invoke(IPC.saveFileDialog, options),
  openDirectoryDialog: (options: unknown) => ipcRenderer.invoke(IPC.openDirectoryDialog, options),
  listDirectory: (dirPath: string) => ipcRenderer.invoke(IPC.listDirectory, dirPath),
  pluginReadFile: (rootDir: string, rel: string) => ipcRenderer.invoke(IPC.pluginReadFile, rootDir, rel),
  pluginReadBinary: (rootDir: string, rel: string) => ipcRenderer.invoke(IPC.pluginReadBinary, rootDir, rel),
  pluginListDirectory: (rootDir: string, rel: string) => ipcRenderer.invoke(IPC.pluginListDirectory, rootDir, rel),
  pluginSandboxRun: (request: unknown) => ipcRenderer.invoke(IPC.pluginSandboxRun, request),
  pluginFetch: (url: string) => ipcRenderer.invoke(IPC.pluginFetch, url),
  pluginVerifySignature: (contentBase64: string, signatureBase64: string, publicKeyPem: string) =>
    ipcRenderer.invoke(IPC.pluginVerifySignature, contentBase64, signatureBase64, publicKeyPem),
  pluginTrustedKeysSync: (keys: string[]) => ipcRenderer.invoke(IPC.pluginTrustedKeysSync, keys),
  pluginTrustedKeysList: () => ipcRenderer.invoke(IPC.pluginTrustedKeysList),
  pluginDigestMatches: (contentBase64: string, digestBase64: string) =>
    ipcRenderer.invoke(IPC.pluginDigestMatches, contentBase64, digestBase64),
  pluginCosignVerify: (contentBase64: string, envelope: { bundle: string; publicKey?: string; certificateIdentity?: string; certificateOidcIssuer?: string }) =>
    ipcRenderer.invoke(IPC.pluginCosignVerify, contentBase64, envelope),

  // 插件安装/卸载（目录索引安装：主进程校验签名与来源后落盘）
  pluginStore: {
    install: (request: unknown) => ipcRenderer.invoke(IPC.plugin.install, request),
    uninstall: (pluginId: string) => ipcRenderer.invoke(IPC.plugin.uninstall, pluginId),
    list: () => ipcRenderer.invoke(IPC.plugin.list),
  },
  // 插件受控网络门（白名单 + 默认拒绝；插件不持有 fetch）
  pluginNet: {
    getPolicy: () => ipcRenderer.invoke(IPC.plugin.netGetPolicy),
    setPolicy: (policy: unknown) => ipcRenderer.invoke(IPC.plugin.netSetPolicy, policy),
    fetch: (request: unknown) => ipcRenderer.invoke(IPC.plugin.netFetch, request),
  },
  // 本地推理运行时（进程管理 + 端点探测）
  localInference: {
    getConfig: () => ipcRenderer.invoke(IPC.local.getConfig),
    setConfig: (config: unknown) => ipcRenderer.invoke(IPC.local.setConfig, config),
    start: () => ipcRenderer.invoke(IPC.local.start),
    stop: () => ipcRenderer.invoke(IPC.local.stop),
    status: () => ipcRenderer.invoke(IPC.local.status),
    probe: () => ipcRenderer.invoke(IPC.local.probe),
  },

  crashReporting: {
    getConfig: () => ipcRenderer.invoke(IPC.crashGetConfig),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC.crashSetEnabled, enabled),
  },
  openPath: (targetPath: string) => ipcRenderer.invoke(IPC.openPath, targetPath),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url),
  exportPackage: (files: Record<string, string>, defaultPath: string) => ipcRenderer.invoke(IPC.exportPackage, files, defaultPath),
  exportDiagnostics: () => ipcRenderer.invoke(IPC.exportDiagnostics),
  mcpClient: {
    connect: (id: string, command: string, args?: string[]) => ipcRenderer.invoke(IPC.mcp.clientConnect, id, command, args),
    tools: (id: string) => ipcRenderer.invoke(IPC.mcp.clientTools, id),
    call: (id: string, tool: string, args?: unknown) => ipcRenderer.invoke(IPC.mcp.clientCall, id, tool, args),
    disconnect: (id: string) => ipcRenderer.invoke(IPC.mcp.clientDisconnect, id),
  },
  printPdf: (html: string, defaultPath: string) => ipcRenderer.invoke(IPC.printPdf, html, defaultPath),

  // 协作传输（主进程持有 WebSocket，渲染层经 IPC 收发）
  collab: {
    open: (url: string) => ipcRenderer.invoke(IPC.collab.open, url),
    send: (id: string, message: unknown) => ipcRenderer.invoke(IPC.collab.send, id, message),
    close: (id: string) => ipcRenderer.invoke(IPC.collab.close, id),
    onMessage: (listener: (id: string, message: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string, message: unknown): void => listener(id, message);
      ipcRenderer.on(IPC.collab.message, handler);
      return () => ipcRenderer.removeListener(IPC.collab.message, handler);
    },
  },

  // 向量存储操作（主进程托管 Vectra 索引）
  vector: {
    initialize: () => ipcRenderer.invoke(IPC.vector.initialize),
    addDocuments: (projectId: string, documents: unknown[]) => ipcRenderer.invoke(IPC.vector.addDocuments, projectId, documents),
    updateDocument: (projectId: string, document: unknown) => ipcRenderer.invoke(IPC.vector.updateDocument, projectId, document),
    deleteDocuments: (projectId: string, documentIds: string[]) => ipcRenderer.invoke(IPC.vector.deleteDocuments, projectId, documentIds),
    semanticSearch: (projectId: string, queryEmbedding: number[], options?: unknown) =>
      ipcRenderer.invoke(IPC.vector.semanticSearch, projectId, queryEmbedding, options),
    getStats: (projectId: string) => ipcRenderer.invoke(IPC.vector.getStats, projectId),
    cleanup: (projectId: string) => ipcRenderer.invoke(IPC.vector.cleanup, projectId),
    checkConsistency: (projectId: string) => ipcRenderer.invoke(IPC.vector.checkConsistency, projectId),
  },

  // SQLite 数据引擎（主进程托管 better-sqlite3）
  db: {
    exec: (sql: string) => ipcRenderer.invoke(IPC.db.exec, sql),
    run: (sql: string, params?: unknown[]) => ipcRenderer.invoke(IPC.db.run, sql, params),
    all: (sql: string, params?: unknown[]) => ipcRenderer.invoke(IPC.db.all, sql, params),
    get: (sql: string, params?: unknown[]) => ipcRenderer.invoke(IPC.db.get, sql, params),
    batch: (statements: unknown[]) => ipcRenderer.invoke(IPC.db.batch, statements),
    integrityCheck: () => ipcRenderer.invoke(IPC.db.integrityCheck),
    fullIntegrityCheck: () => ipcRenderer.invoke(IPC.db.fullIntegrityCheck),
    hotBackup: (keep?: number) => ipcRenderer.invoke(IPC.db.hotBackup, keep),
    hotBackupList: () => ipcRenderer.invoke(IPC.db.hotBackupList),
    hotBackupVerify: (fileName: string) => ipcRenderer.invoke(IPC.db.hotBackupVerify, fileName),
    hotBackupRestore: (fileName: string) => ipcRenderer.invoke(IPC.db.hotBackupRestore, fileName),
    maintenance: () => ipcRenderer.invoke(IPC.db.maintenance),
    encryptionStatus: () => ipcRenderer.invoke(IPC.db.encryptionStatus),
    enableEncryption: () => ipcRenderer.invoke(IPC.db.enableEncryption),
    disableEncryption: () => ipcRenderer.invoke(IPC.db.disableEncryption),
    exportRecoveryKey: () => ipcRenderer.invoke(IPC.db.exportRecoveryKey),
    applyRecoveryKey: (code: string) => ipcRenderer.invoke(IPC.db.applyRecoveryKey, code),
    encryptText: (text: string) => ipcRenderer.invoke(IPC.db.encryptText, text),
    decryptText: (payload: string) => ipcRenderer.invoke(IPC.db.decryptText, payload),
  },

  // AI 网关（适配器在主进程执行；流式事件经 streamEvent 通道按 requestId 推送）
  aiGateway: {
    complete: (requestId: string, model: unknown, prompt: string, options?: unknown) =>
      ipcRenderer.invoke(IPC.ai.complete, requestId, model, prompt, options),
    openStream: (requestId: string, model: unknown, prompt: string, options?: unknown) =>
      ipcRenderer.invoke(IPC.ai.streamOpen, requestId, model, prompt, options),
    abort: (requestId: string) => ipcRenderer.invoke(IPC.ai.abort, requestId),
    http: (request: unknown) => ipcRenderer.invoke(IPC.ai.http, request),
    onStreamEvent: (listener: (event: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown): void => listener(payload);
      ipcRenderer.on(IPC.ai.streamEvent, handler);
      return () => ipcRenderer.removeListener(IPC.ai.streamEvent, handler);
    },
  },
  // 安全密钥库（safeStorage/OS 钥匙串；渲染端只持 vault: 引用）
  vault: {
    isAvailable: () => ipcRenderer.invoke(IPC.vault.isAvailable),
    set: (id: string, plaintext: string) => ipcRenderer.invoke(IPC.vault.set, id, plaintext),
    get: (id: string) => ipcRenderer.invoke(IPC.vault.get, id),
    remove: (id: string) => ipcRenderer.invoke(IPC.vault.remove, id),
  },
  // 系统壳（托盘/自启设置下发）
  shell: {
    sync: (settings: { minimizeToTray?: boolean; autoLaunch?: boolean }) =>
      ipcRenderer.invoke(IPC.shell.sync, settings),
  },
  // 网络代理（地址下发 + 连通测试）
  net: {
    setProxy: (url: string) => ipcRenderer.invoke(IPC.net.setProxy, url),
    testProxy: (url: string) => ipcRenderer.invoke(IPC.net.testProxy, url),
  },
  // 同步传输（本地目录 / WebDAV / S3；主进程执行并解引用保险库凭据）
  sync: {
    testTransport: (config: unknown) => ipcRenderer.invoke(IPC.sync.transportTest, config),
    put: (config: unknown, key: string, data: string) => ipcRenderer.invoke(IPC.sync.transportPut, config, key, data),
    putChunked: (config: unknown, key: string, data: string) => ipcRenderer.invoke(IPC.sync.transportPutChunked, config, key, data),
    get: (config: unknown, key: string) => ipcRenderer.invoke(IPC.sync.transportGet, config, key),
    getChunked: (config: unknown, key: string) => ipcRenderer.invoke(IPC.sync.transportGetChunked, config, key),
    list: (config: unknown, prefix?: string) => ipcRenderer.invoke(IPC.sync.transportList, config, prefix),
    remove: (config: unknown, key: string) => ipcRenderer.invoke(IPC.sync.transportRemove, config, key),
  },
  // 退出导出握手：主进程 before-quit 请求渲染层导出，完成后回执
  onExitExportRequest: (listener: () => void) => {
    const handler = (): void => listener();
    ipcRenderer.on(IPC.sync.exitExportRequest, handler);
    return () => ipcRenderer.removeListener(IPC.sync.exitExportRequest, handler);
  },
  notifyExitExportDone: () => ipcRenderer.send(IPC.sync.exitExportDone),
  // 自动更新（打包版原生链路；开发版无 updater 字段，渲染层退回 GitHub 查询）
  updater: {
    check: () => ipcRenderer.invoke(IPC.updater.check),
    download: () => ipcRenderer.invoke(IPC.updater.download),
    install: () => ipcRenderer.invoke(IPC.updater.install),
    onStatus: (listener: (status: unknown) => void) => {
      const handler = (_event: unknown, payload: unknown): void => listener(payload);
      ipcRenderer.on(IPC.updater.event, handler);
      return () => ipcRenderer.removeListener(IPC.updater.event, handler);
    },
  },
});
