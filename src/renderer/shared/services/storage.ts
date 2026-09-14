/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { i18n } from '@/i18n';
import { dialogService } from '@/shared/services/dialogService';
import { localStore } from '@/shared/services/localStore';

import { type AppState, type ConsistencyCheckConfig, type ConsistencyCheckPromptTemplate,type Project, type StorageConfig } from "../../../shared/types";
import { logger } from '../utils/logger';
import { AutoBackupService } from "./autoBackupService";
import { FileDialogCanceledError } from './fileDialogError';
import { migrateKnowledgeCategories, migrateVirtualChapters } from './storageMigrations';

// 使用Electron API进行文件系统存储
const STORAGE_FILE_NAME = 'novalist-data.json';
const STORAGE_CONFIG_FILE = 'storage-config.json';

// 自动备份服务实例
const autoBackupService = AutoBackupService.getInstance();

/** 迁移到 SQLite 后清理 localStorage 回退数据（浏览器无文件系统场景）。 */
export function removeLocalStateFallback(): void {
  localStore.removeItem(STORAGE_FILE_NAME);
}

// 默认存储配置（备份默认开启：每 30 秒一次，保留最近 5 份）
const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  dataPath: '',
  useCustomPath: false,
  lastMigration: undefined,
  autoBackupEnabled: true,
  autoBackupInterval: 30,
  maxBackupFiles: 5,
};

// 历史数据迁移见 ./storageMigrations
const getStorageConfig = async (): Promise<StorageConfig> => {
  if (window.electronAPI) {
    try {
      const appDataPath = await window.electronAPI.getAppDataPath();
      const configPath = `${appDataPath}/${STORAGE_CONFIG_FILE}`;
      const exists = await window.electronAPI.exists(configPath);
      if (exists) {
        const data = await window.electronAPI.readFile(configPath);
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Failed to load storage config:', error);
    }
  }
  return DEFAULT_STORAGE_CONFIG;
};

// 保存存储配置
const saveStorageConfig = async (config: StorageConfig): Promise<boolean> => {
  if (window.electronAPI) {
    try {
      const appDataPath = await window.electronAPI.getAppDataPath();
      const configPath = `${appDataPath}/${STORAGE_CONFIG_FILE}`;
      await window.electronAPI.writeFile(configPath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      logger.error('Failed to save storage config:', error);
      return false;
    }
  }
  return false;
};

// 获取存储文件路径
const getStoragePath = async (): Promise<string> => {
  if (window.electronAPI) {
    try {
      const config = await getStorageConfig();
      if (config.useCustomPath && config.dataPath) {
        // 自定义数据目录经路径门注册后才能读写
        await window.electronAPI.allowPath?.(config.dataPath).catch(() => undefined);
        return `${config.dataPath}/${STORAGE_FILE_NAME}`;
      } else {
        // 使用默认应用数据路径
        const appDataPath = await window.electronAPI.getAppDataPath();
        return `${appDataPath}/${STORAGE_FILE_NAME}`;
      }
    } catch (error) {
      logger.error('Failed to get storage path:', error);
      // 出错时回退到默认路径
      const appDataPath = await window.electronAPI.getAppDataPath();
      return `${appDataPath}/${STORAGE_FILE_NAME}`;
    }
  }
  // 回退到localStorage（开发模式）
  return STORAGE_FILE_NAME;
};

export const storage = {
  saveState: async (state: AppState) => {
    if (window.electronAPI) {
      try {
        const filePath = await getStoragePath();
        await window.electronAPI.writeFile(filePath, JSON.stringify(state));
        logger.debug('State saved to file:', filePath);
      } catch (error) {
        logger.error('Failed to save state to file:', error);
        // 回退到localStorage
        localStore.setItem(STORAGE_FILE_NAME, JSON.stringify(state));
      }
    } else {
      // 开发模式：使用localStorage
      localStore.setItem(STORAGE_FILE_NAME, JSON.stringify(state));
    }
  },
  
  loadState: (): AppState | null => {
    if (window.electronAPI) {
      // 在Electron中，我们需要异步加载，但为了保持API兼容性，返回null并异步更新
      // 应用启动时会调用loadState，我们返回null，然后在useEffect中异步加载
      return null;
    } else {
      // 开发模式：使用localStorage
      const data = localStore.getItem(STORAGE_FILE_NAME);
      return data ? JSON.parse(data) : null;
    }
  },

  // 新增：异步加载状态（用于Electron环境）
  loadStateAsync: async (): Promise<AppState | null> => {
    if (window.electronAPI) {
      try {
        const filePath = await getStoragePath();
        const exists = await window.electronAPI.exists(filePath);
        if (exists) {
          const data = await window.electronAPI.readFile(filePath);
          const state = JSON.parse(data);
          
          // 数据迁移：为知识库条目添加默认分类
          const stateWithKnowledgeCategories = migrateKnowledgeCategories(state);
          // 数据迁移：将虚拟章节从chapters数组迁移到virtualChapters数组
          return migrateVirtualChapters(stateWithKnowledgeCategories);
        }
        return null;
      } catch (error) {
        logger.error('Failed to load state from file:', error);
        // 回退到localStorage
        const data = localStore.getItem(STORAGE_FILE_NAME);
        if (data) {
          const state = JSON.parse(data);
          const stateWithKnowledgeCategories = migrateKnowledgeCategories(state);
          return migrateVirtualChapters(stateWithKnowledgeCategories);
        }
        return null;
      }
    } else {
      // 开发模式：使用localStorage
      const data = localStore.getItem(STORAGE_FILE_NAME);
      if (data) {
        const state = JSON.parse(data);
        const stateWithKnowledgeCategories = migrateKnowledgeCategories(state);
        return migrateVirtualChapters(stateWithKnowledgeCategories);
      }
      return null;
    }
  },

  clearState: async () => {
    if (window.electronAPI) {
      try {
        const filePath = await getStoragePath();
        const exists = await window.electronAPI.exists(filePath);
        if (exists) {
          await window.electronAPI.unlink(filePath);
        }
      } catch (error) {
        logger.error('Failed to delete state file:', error);
        localStore.removeItem(STORAGE_FILE_NAME);
      }
    } else {
      localStore.removeItem(STORAGE_FILE_NAME);
    }
  },

  exportData: async (state: AppState) => {
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.saveFileDialog({
          title: i18n.t('app:storage.exportAllTitle'),
          defaultPath: `novalist-backup-${new Date().toISOString().split('T')[0]}.json`,
          filters: [
            { name: i18n.t('app:storage.jsonFilter'), extensions: ['json'] },
            { name: i18n.t('app:storage.allFilesFilter'), extensions: ['*'] }
          ]
        });
        
        if (!result.canceled && result.filePath) {
          await window.electronAPI.writeFile(result.filePath, JSON.stringify(state));
          dialogService.alert(i18n.t('app:storage.exportAllSuccess'));
        }
      } catch (error) {
        logger.error('Failed to export data:', error);
        // 回退到浏览器下载
        const dataStr = JSON.stringify(state);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `novalist-backup-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
      }
    } else {
      // 浏览器模式
      const dataStr = JSON.stringify(state);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `novalist-backup-${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    }
  },

  importData: async (): Promise<AppState> => {
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.openFileDialog({
          title: i18n.t('app:storage.importAllTitle'),
          filters: [
            { name: i18n.t('app:storage.jsonFilter'), extensions: ['json'] },
            { name: i18n.t('app:storage.allFilesFilter'), extensions: ['*'] }
          ],
          properties: ['openFile']
        });
        
        const filePath = result.filePaths[0];
        if (!result.canceled && filePath) {
          const data = await window.electronAPI.readFile(filePath);
          logger.debug('导入的原始数据:', data.substring(0, 500) + '...');
          const state = JSON.parse(data);
          logger.debug('解析后的状态结构:', {
            hasProjects: !!state.projects,
            projectsCount: state.projects?.length || 0,
            hasActiveProjectId: !!state.activeProjectId,
            activeProjectId: state.activeProjectId
          });
          
          // 数据迁移：为知识库条目添加默认分类
          const stateWithKnowledgeCategories = migrateKnowledgeCategories(state);
          // 数据迁移：将虚拟章节从chapters数组迁移到virtualChapters数组
          const migratedState = migrateVirtualChapters(stateWithKnowledgeCategories);
          logger.debug('迁移后的状态:', {
            projectsCount: migratedState.projects?.length || 0,
            activeProjectId: migratedState.activeProjectId
          });
          return migratedState;
        }
        throw new FileDialogCanceledError();
      } catch (error) {
        logger.error('Failed to import data:', error);
        throw error;
      }
    } else {
      // 浏览器模式：使用文件输入
      return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) {
            reject(new FileDialogCanceledError());
            return;
          }
          
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const data = e.target?.result as string;
              logger.debug('导入的原始数据:', data.substring(0, 500) + '...');
              const state = JSON.parse(data);
              logger.debug('解析后的状态结构:', {
                hasProjects: !!state.projects,
                projectsCount: state.projects?.length || 0,
                hasActiveProjectId: !!state.activeProjectId,
                activeProjectId: state.activeProjectId
              });
              
              // 数据迁移：为知识库条目添加默认分类
              const stateWithKnowledgeCategories = migrateKnowledgeCategories(state);
              // 数据迁移：将虚拟章节从chapters数组迁移到virtualChapters数组
              const migratedState = migrateVirtualChapters(stateWithKnowledgeCategories);
              logger.debug('迁移后的状态:', {
                projectsCount: migratedState.projects?.length || 0,
                activeProjectId: migratedState.activeProjectId
              });
              resolve(migratedState);
            } catch (err) {
              logger.error('导入数据解析失败:', err);
              reject(err);
            }
          };
          reader.readAsText(file);
        };
        
        input.click();
      });
    }
  },

  // 新增：获取存储配置
  getStorageConfig: async (): Promise<StorageConfig> => {
    return await getStorageConfig();
  },

  // 新增：更新存储配置（自动备份由持久化桥按间隔触发，此处只落盘配置）
  updateStorageConfig: async (config: StorageConfig): Promise<boolean> => {
    return await saveStorageConfig(config);
  },

  // 新增：迁移数据到新路径
  getCurrentDataPath: async (): Promise<string> => {
    return await getStoragePath();
  },

  // 新增：获取默认应用数据路径
  getDefaultAppDataPath: async (): Promise<string> => {
    if (window.electronAPI) {
      return await window.electronAPI.getAppDataPath();
    }
    return '';
  },

  // 新增：导出当前书籍（单个项目）
  exportCurrentBook: async (project: Project) => {
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.saveFileDialog({
          title: i18n.t('app:book.exportTitle'),
          defaultPath: `${project.title.replace(/[<>:"/\\|?*]/g, '_')}-${new Date().toISOString().split('T')[0]}.json`,
          filters: [
            { name: i18n.t('app:storage.jsonFilter'), extensions: ['json'] },
            { name: i18n.t('app:storage.allFilesFilter'), extensions: ['*'] }
          ]
        });
        
        if (!result.canceled && result.filePath) {
          await window.electronAPI.writeFile(result.filePath, JSON.stringify(project));
          dialogService.alert(i18n.t('app:book.exportSuccess', { title: project.title }));
        }
      } catch (error) {
        logger.error('Failed to export current book:', error);
        // 回退到浏览器下载
        const dataStr = JSON.stringify(project);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `${project.title.replace(/[<>:"/\\|?*]/g, '_')}-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
      }
    } else {
      // 浏览器模式
      const dataStr = JSON.stringify(project);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `${project.title.replace(/[<>:"/\\|?*]/g, '_')}-${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    }
  },

  // 新增：导入单个书籍
  importBook: async (): Promise<Project> => {
    if (window.electronAPI) {
      try {
        const result = await window.electronAPI.openFileDialog({
          title: i18n.t('app:bookshelf.importBook'),
          filters: [
            { name: i18n.t('app:storage.jsonFilter'), extensions: ['json'] },
            { name: i18n.t('app:storage.allFilesFilter'), extensions: ['*'] }
          ],
          properties: ['openFile']
        });
        
        const filePath = result.filePaths[0];
        if (!result.canceled && filePath) {
          const data = await window.electronAPI.readFile(filePath);
          const project = JSON.parse(data);
          
          // 验证导入的数据是否为有效的Project对象
          if (!project.id || !project.title) {
            throw new Error(i18n.t('app:book.invalidFile'));
          }
          
          // 确保导入的书籍有唯一的ID（避免与现有书籍冲突）
          project.id = Date.now().toString();
          project.lastModified = Date.now();
          
          return project;
        }
        throw new FileDialogCanceledError();
      } catch (error) {
        logger.error('Failed to import book:', error);
        throw error;
      }
    } else {
      // 浏览器模式：使用文件输入
      return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) {
            reject(new FileDialogCanceledError());
            return;
          }
          
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const project = JSON.parse(e.target?.result as string);
              
              // 验证导入的数据是否为有效的Project对象
              if (!project.id || !project.title) {
                reject(new Error(i18n.t('app:book.invalidFile')));
                return;
              }
              
              // 确保导入的书籍有唯一的ID（避免与现有书籍冲突）
              project.id = Date.now().toString();
              project.lastModified = Date.now();
              
              resolve(project);
            } catch (err) {
              reject(err);
            }
          };
          reader.readAsText(file);
        };
        
        input.click();
      });
    }
  },

  // 新增：手动触发备份
  triggerManualBackup: async (state: AppState): Promise<boolean> => {
    try {
      const config = await getStorageConfig();
      return await autoBackupService.performBackup(config, () => state);
    } catch (error) {
      logger.error('手动备份失败:', error);
      return false;
    }
  },

  // ========== 一致性检查配置相关方法 ==========

  // 加载一致性检查配置
  loadConsistencyCheckConfig: async (): Promise<ConsistencyCheckConfig | null> => {
    try {
      let state: AppState | null = null;
      
      if (window.electronAPI) {
        const filePath = await getStoragePath();
        const data = await window.electronAPI.readFile(filePath);
        state = JSON.parse(data);
      } else {
        const data = localStore.getItem(STORAGE_FILE_NAME);
        state = data ? JSON.parse(data) : null;
      }
      
      return state?.consistencyCheckConfig || null;
    } catch (error) {
      logger.error('Failed to load consistency check config:', error);
      return null;
    }
  },

  // 加载一致性检查提示词模板
  loadConsistencyPrompts: async (): Promise<ConsistencyCheckPromptTemplate[] | null> => {
    try {
      let state: AppState | null = null;
      
      if (window.electronAPI) {
        const filePath = await getStoragePath();
        const data = await window.electronAPI.readFile(filePath);
        state = JSON.parse(data);
      } else {
        const data = localStore.getItem(STORAGE_FILE_NAME);
        state = data ? JSON.parse(data) : null;
      }
      
      return state?.consistencyPrompts || null;
    } catch (error) {
      logger.error('Failed to load consistency prompts:', error);
      return null;
    }
  }
};



