/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { i18n } from '@/i18n';

import { type AppState, type StorageConfig } from '../../../shared/types';
import { logger } from '../utils/logger';

// 自动备份服务：按间隔判定 + 落盘备份（调度由持久化桥在每次落盘后触发）
export class AutoBackupService {
  private static instance: AutoBackupService;

  // 单例模式
  public static getInstance(): AutoBackupService {
    if (!AutoBackupService.instance) {
      AutoBackupService.instance = new AutoBackupService();
    }
    return AutoBackupService.instance;
  }

  // 执行单次备份
  public async performBackup(config: StorageConfig, getCurrentState: () => AppState | null): Promise<boolean> {
    try {
      // 获取当前应用状态
      const currentState = getCurrentState();
      if (!currentState) {
        logger.warn('无法获取当前应用状态，跳过备份');
        return false;
      }

      // 检查是否在Electron环境中
      if (typeof window === 'undefined' || !window.electronAPI) {
        logger.warn('不在Electron环境中，跳过备份');
        return false;
      }

      // 获取存储路径
      const storagePath = await this.getStoragePath(config);
      const backupDir = `${storagePath}/backups`;
      
      // 创建备份目录（如果不存在）
      try {
        const exists = await window.electronAPI.exists(backupDir);
        if (!exists) {
          // 注意：Electron API没有直接的mkdir方法，我们需要通过其他方式创建目录
          // 这里我们尝试写入一个临时文件来触发目录创建
          const tempFile = `${backupDir}/.temp`;
          await window.electronAPI.writeFile(tempFile, '');
          await window.electronAPI.unlink(tempFile);
        }
      } catch (error) {
        logger.warn('创建备份目录失败:', error);
        // 继续尝试备份，可能会失败
      }

      // 生成备份文件名（库级加密启用时快照落密文，避免明文外泄）
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const payload = JSON.stringify(currentState, null, 2);
      const dbApi = window.electronAPI.db;
      const encryption = await dbApi?.encryptionStatus?.().catch(() => undefined);
      const encrypted = encryption?.enabled === true;
      let content = payload;
      if (encrypted) {
        const result = await dbApi?.encryptText?.(payload);
        if (!result?.ok || !result.data) {
          logger.error('备份加密失败:', result?.error);
          return false;
        }
        content = result.data;
      }
      const backupFileName = `novalist-backup-${timestamp}.json${encrypted ? '.enc' : ''}`;
      const backupFilePath = `${backupDir}/${backupFileName}`;

      // 保存备份文件
      await window.electronAPI.writeFile(backupFilePath, content);
      
      // 更新上次备份时间
      config.lastAutoBackup = Date.now();
      
      // 清理旧备份文件（按文件名时间倒序保留 maxBackupFiles 个）
      await this.cleanupOldBackups(backupDir, config.maxBackupFiles || 1);

      logger.debug(`备份成功: ${backupFileName}`);
      return true;
    } catch (error) {
      logger.error('备份失败:', error);
      return false;
    }
  }

  // 清理旧备份文件（按文件名时间倒序保留 maxBackupFiles 个）
  private async cleanupOldBackups(backupDir: string, maxBackupFiles: number): Promise<void> {
    try {
      if (typeof window === 'undefined' || !window.electronAPI) return;
      const entries = await window.electronAPI.listDirectory(backupDir).catch(() => []);
      const backups = entries
        .filter((e) => e.type === 'file' && isBackupName(e.name))
        .map((e) => e.name)
        .sort()
        .reverse();
      for (const name of backups.slice(Math.max(1, maxBackupFiles))) {
        await window.electronAPI.unlink(`${backupDir}/${name}`).catch(() => {});
      }
    } catch (error) {
      logger.error('清理旧备份失败:', error);
    }
  }

  // 获取存储路径
  private async getStoragePath(config: StorageConfig): Promise<string> {
    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error(i18n.t('errors:backup.desktopRequired'));
    }

    if (config.useCustomPath && config.dataPath) {
      // 自定义数据目录由主进程按持久化配置自行授权（51 篇），渲染层无授权通道
      return config.dataPath;
    } else {
      const appDataPath = await window.electronAPI.getAppDataPath();
      return appDataPath;
    }
  }

  // 检查是否应该执行备份（距上次备份已超过间隔；调度由持久化桥调用）
  public shouldPerformBackup(config: StorageConfig): boolean {
    if (!config.autoBackupEnabled || !config.autoBackupInterval) {
      return false;
    }

    const now = Date.now();
    const lastBackup = config.lastAutoBackup || 0;
    const intervalMs = (config.autoBackupInterval || 30) * 1000;

    return (now - lastBackup) >= intervalMs;
  }

  // 获取备份历史（文件名时间倒序；损坏文件跳过）
  public async getBackupHistory(config: StorageConfig): Promise<Array<{
    fileName: string;
    filePath: string;
    size: number;
    timestamp: number;
  }>> {
    try {
      if (typeof window === 'undefined' || !window.electronAPI) return [];
      const backupDir = `${await this.getStoragePath(config)}/backups`;
      const entries = await window.electronAPI.listDirectory(backupDir).catch(() => []);
      const out: Array<{ fileName: string; filePath: string; size: number; timestamp: number }> = [];
      for (const e of entries) {
        if (e.type !== 'file' || !isBackupName(e.name)) continue;
        try {
          const content = await window.electronAPI.readFile(`${backupDir}/${e.name}`);
          out.push({
            fileName: e.name,
            filePath: `${backupDir}/${e.name}`,
            size: content.length,
            timestamp: parseBackupTimestamp(e.name),
          });
        } catch {
          // 损坏文件跳过
        }
      }
      return out.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('读取备份历史失败:', error);
      return [];
    }
  }

  /** 从备份文件恢复整库快照（调用方负责 hydrate + 重建差分基线）。 */
  public async readBackup(filePath: string): Promise<AppState | null> {
    try {
      if (typeof window === 'undefined' || !window.electronAPI) return null;
      let content = await window.electronAPI.readFile(filePath);
      if (filePath.endsWith('.enc')) {
        const result = await window.electronAPI.db.decryptText(content);
        if (!result.ok || !result.text) {
          logger.error('备份解密失败:', result.error);
          return null;
        }
        content = result.text;
      }
      const parsed = JSON.parse(content) as AppState;
      if (!parsed || !Array.isArray(parsed.projects)) return null;
      return parsed;
    } catch (error) {
      logger.error('读取备份文件失败:', error);
      return null;
    }
  }
}

/** 备份文件名判定（明文 .json 或加密 .json.enc）。 */
function isBackupName(name: string): boolean {
  return name.startsWith('novalist-backup-') && (name.endsWith('.json') || name.endsWith('.json.enc'));
}

/** 备份文件名时间解析（novalist-backup-<ISO 变体>.json[.enc]），失败回 0。 */
function parseBackupTimestamp(fileName: string): number {
  const m = fileName.match(/^novalist-backup-(.+)\.json(?:\.enc)?$/);
  if (!m?.[1]) return 0;
  const iso = m[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d+)(Z?)$/, 'T$1:$2:$3.$4$5');
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? 0 : ts;
}

// 导出单例实例
export const autoBackupService = AutoBackupService.getInstance();



