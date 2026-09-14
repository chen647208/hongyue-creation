/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * IPC 通道名称常量 —— 主进程与 preload 共用的唯一事实来源。
 * 渲染进程不直接引用通道名，一律通过 preload 暴露的语义化方法调用。
 */
export const IPC = {
  getAppDataPath: 'get-app-data-path',
  allowPath: 'fs:allow-path',
  readFile: 'read-file',
  writeFile: 'write-file',
  appendFile: 'append-file',
  writeBinaryFile: 'write-binary-file',
  extractPdfText: 'extract-pdf-text',
  flushRequest: 'app:flush-request',
  flushDone: 'app:flush-done',
  fileExists: 'file-exists',
  deleteFile: 'delete-file',
  openFileDialog: 'open-file-dialog',
  saveFileDialog: 'save-file-dialog',
  printPdf: 'print-pdf',
  openDirectoryDialog: 'open-directory-dialog',
  listDirectory: 'list-directory',
  pluginReadFile: 'plugin-read-file',
  pluginReadBinary: 'plugin-read-binary',
  pluginListDirectory: 'plugin-list-directory',
  pluginSandboxRun: 'plugin-sandbox-run',
  pluginFetch: 'plugin-fetch',
  pluginVerifySignature: 'plugin-verify-signature',
  pluginTrustedKeysSync: 'plugin-trusted-keys-sync',
  pluginTrustedKeysList: 'plugin-trusted-keys-list',
  pluginDigestMatches: 'plugin-digest-matches',
  pluginCosignVerify: 'plugin-cosign-verify',
  crashGetConfig: 'crash:get-config',
  crashSetEnabled: 'crash:set-enabled',
  openPath: 'open-path',
  openExternal: 'open-external',
  exportPackage: 'export-package',
  exportDiagnostics: 'export-diagnostics',
  vector: {
    initialize: 'vector:initialize',
    addDocuments: 'vector:add-documents',
    updateDocument: 'vector:update-document',
    deleteDocuments: 'vector:delete-documents',
    semanticSearch: 'vector:semantic-search',
    getStats: 'vector:get-stats',
    cleanup: 'vector:cleanup',
    checkConsistency: 'vector:check-consistency',
  },

  // SQLite 数据引擎（主进程托管 better-sqlite3，渲染层经类型化 IPC 调用）
  db: {
    exec: 'db:exec',
    run: 'db:run',
    all: 'db:all',
    get: 'db:get',
    batch: 'db:batch',
    integrityCheck: 'db:integrity-check',
    fullIntegrityCheck: 'db:full-integrity-check',
    hotBackup: 'db:hot-backup',
    hotBackupList: 'db:hot-backup-list',
    hotBackupVerify: 'db:hot-backup-verify',
    hotBackupRestore: 'db:hot-backup-restore',
    maintenance: 'db:maintenance',
    encryptionStatus: 'db:encryption-status',
    enableEncryption: 'db:enable-encryption',
    disableEncryption: 'db:disable-encryption',
    exportRecoveryKey: 'db:export-recovery-key',
    applyRecoveryKey: 'db:apply-recovery-key',
    encryptText: 'db:encrypt-text',
    decryptText: 'db:decrypt-text',
  },

  // AI 网关（适配器在主进程执行；流式事件按 requestId 多路推送）
  ai: {
    complete: 'ai:complete',
    streamOpen: 'ai:stream:open',
    streamEvent: 'ai:stream:event',
    abort: 'ai:stream:abort',
    http: 'ai:http',
  },

  // MCP 客户端（连接外部 MCP server：列表/调用走主进程 stdio）
  mcp: {
    clientConnect: 'mcp:client-connect',
    clientTools: 'mcp:client-tools',
    clientCall: 'mcp:client-call',
    clientDisconnect: 'mcp:client-disconnect',
  },

  // 安全密钥库（safeStorage/OS 钥匙串；渲染端只持 vault: 引用）
  vault: {
    isAvailable: 'vault:is-available',
    set: 'vault:set',
    get: 'vault:get',
    remove: 'vault:remove',
  },

  // 系统壳（托盘/自启设置下发；关闭拦截在主进程按设置执行）
  shell: {
    sync: 'shell:sync',
  },

  // 网络代理（地址下发 + 连通测试；网关与 Chromium 双覆盖）
  net: {
    setProxy: 'net:set-proxy',
    testProxy: 'net:test-proxy',
  },

  // 自动更新（打包版原生链路：检查/下载/安装 + 进度事件推送）
  updater: {
    check: 'updater:check',
    download: 'updater:download',
    install: 'updater:install',
    event: 'updater:event',
  },

  // 协作传输（主进程持有 WebSocket，渲染层经 IPC 收发；跨设备协作）
  collab: {
    open: 'collab:open',
    send: 'collab:send',
    close: 'collab:close',
    message: 'collab:message',
  },
} as const;
