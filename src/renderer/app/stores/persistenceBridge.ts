/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 双 store → repository 持久化桥（06 篇 §2.2）。
 *
 * 组合设置/项目两个 store 为逻辑 AppState，任一 store 变化即走 persistDiff
 * 差分落盘（逐书/逐设置分片），再按存储子系统配置触发自动备份。
 * 基线由首启动 hydrate 建立：磁盘现状 == 刚载入的组合态，首帧不整体重写。
 */

import { dt } from '@/i18n';

import { APP_STATE_VERSION } from '../../../shared/constants/versions';
import { type AppState, type StorageConfig } from '../../../shared/types';
import { autoBackupService } from '../../shared/services/autoBackupService';
import { repository } from '../../shared/services/repository';
import { TaskScheduler } from '../../shared/services/taskScheduler';
import { toast } from '../../shared/services/toastService';
import { logger } from '../../shared/utils/logger';
import { persistDiff } from '../persistDiff';
import { commitMetaOf,useProjectStore } from './projectStore';
import { useSettingsStore } from './settingsStore';

/** 把两个 store 的当前值组合为逻辑 AppState（供导出/一致性哨兵使用）。 */
export function composeAppState(): AppState {
  const p = useProjectStore.getState();
  const s = useSettingsStore.getState();
  return {
    schemaVersion: APP_STATE_VERSION,
    projects: p.projects,
    activeProjectId: p.activeProjectId,
    models: s.models,
    prompts: s.prompts,
    activeModelId: s.activeModelId,
    embeddingModels: s.embeddingModels,
    activeEmbeddingModelId: s.activeEmbeddingModelId,
    cardPrompts: s.cardPrompts,
    consistencyPrompts: s.consistencyPrompts,
    consistencyCheckConfig: s.consistencyCheckConfig,
    language: s.language,
    theme: s.theme,
    uiFont: s.uiFont,
    editorFont: s.editorFont,
    customFonts: s.customFonts,
    mcpServers: s.mcpServers,
    uiFontSize: s.uiFontSize,
    editorFontSize: s.editorFontSize,
    editorLineHeight: s.editorLineHeight,
    keybindings: s.keybindings,
    proxy: s.proxy,
    minimizeToTray: s.minimizeToTray,
    autoLaunch: s.autoLaunch,
  };
}

let lastPersisted: AppState | null = null;
let started = false;
let inflight: Promise<void> | null = null;
let dirty = false;
let failing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelayMs = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let firstDirtyAt = 0;

/** 合并连续编辑：停止输入 400ms 后落盘；连续输入最多 3s 必落一次。 */
const FLUSH_DEBOUNCE_MS = 400;
const FLUSH_MAX_WAIT_MS = 3000;

/** 周期任务调度器：自动备份兜底（空闲不落盘时也按间隔备份）。 */
const scheduler = new TaskScheduler();

/** 存储配置缓存：避免每次落盘都读一次配置文件。 */
const STORAGE_CONFIG_TTL_MS = 30_000;
let storageConfigCache: { config: StorageConfig; at: number } | null = null;

async function getCachedStorageConfig(): Promise<StorageConfig> {
  if (storageConfigCache && Date.now() - storageConfigCache.at < STORAGE_CONFIG_TTL_MS) {
    return storageConfigCache.config;
  }
  const config = await repository.getStorageConfig();
  storageConfigCache = { config, at: Date.now() };
  return config;
}

/** 建立差分基线（首启动 hydrate 后调用；base 即磁盘现状的组合态）。 */
export function seedPersistBaseline(base: AppState | null): void {
  lastPersisted = base;
}

async function doFlush(): Promise<void> {
  try {
    const next = composeAppState();
    const prev = lastPersisted;
    if (prev === null) {
      await repository.saveAll(next);
    } else {
      // 归因随新引用绑定传入（WeakMap）：AI 落笔帧带 agentId/cause，手写帧无绑定即 user
      await persistDiff(repository, prev, next, commitMetaOf);
    }
    // 仅在成功后才推进基线：失败时保持旧基线，重试会重算同一份差分
    lastPersisted = next;
    dirty = false;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryDelayMs = 0;
    if (failing) {
      failing = false;
      toast.success(dt('app:persist.saveRecovered'));
    }
    await maybeAutoBackup();
  } catch (error) {
    logger.error('持久化或自动备份失败:', error);
    dirty = true; // 保持待写，交给退避重试
    if (!failing) {
      failing = true;
      toast.error(dt('app:persist.saveFailed'));
    }
    scheduleRetry();
  }
}

/** 自动备份：按间隔判定，成功后回写上次备份时间。落盘后与周期任务共用同一入口。 */
async function maybeAutoBackup(): Promise<void> {
  const config = await getCachedStorageConfig();
  if (!config.autoBackupEnabled || !autoBackupService.shouldPerformBackup(config)) return;
  const backedUp = await autoBackupService.performBackup(config, () => composeAppState());
  // 数据库一致副本（VACUUM INTO）：与 JSON 快照互补，含 WAL 中未 checkpoint 的数据。
  await repository.hotBackup?.(config.maxBackupFiles).catch((error) => {
    logger.warn('数据库热备份失败:', error);
  });
  if (backedUp) {
    const updated = { ...config, lastAutoBackup: Date.now() };
    await repository.updateStorageConfig(updated);
    storageConfigCache = { config: updated, at: Date.now() };
  }
}

function scheduleRetry(): void {
  if (retryTimer || typeof window === 'undefined') return;
  retryDelayMs = retryDelayMs ? Math.min(retryDelayMs * 2, 30_000) : 1_000;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    dirty = true;
    void flush();
  }, retryDelayMs);
}

/** 触发一次差分落盘；已有在途写入时复用同一 Promise（同循环内的合并更新只跑一次）。 */
function flush(): Promise<void> {
  if (inflight) return inflight;
  if (!dirty && lastPersisted !== null) return Promise.resolve();
  inflight = doFlush().finally(() => {
    inflight = null;
    // 在途期间又有变更：立即再跑一轮；失败则交给退避重试，避免无延迟热循环
    if (dirty && !failing) void flush();
  });
  return inflight;
}

/** 强制刷盘（退出/隐藏前调用）：取消去抖，等待在途写入，再补一次，保证退出时差分已落库。 */
export async function flushNow(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  firstDirtyAt = 0;
  if (inflight) await inflight;
  dirty = true;
  await flush();
}

/** 去抖触发落盘：合并连续编辑，最多等待 FLUSH_MAX_WAIT_MS 后强制落一次。 */
function scheduleFlush(): void {
  dirty = true;
  const now = Date.now();
  if (!firstDirtyAt) firstDirtyAt = now;
  if (debounceTimer) clearTimeout(debounceTimer);
  const remainingMax = FLUSH_MAX_WAIT_MS - (now - firstDirtyAt);
  const delay = Math.max(0, Math.min(FLUSH_DEBOUNCE_MS, remainingMax));
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    firstDirtyAt = 0;
    void flush();
  }, delay);
}

let flushHandlersBound = false;

/** 绑定退出前刷盘：主进程 flush-request → 刷盘 → flush-done；并加 beforeunload 兜底。 */
function bindFlushHandlers(): void {
  if (flushHandlersBound || typeof window === 'undefined') return;
  flushHandlersBound = true;
  const api = window.electronAPI;
  if (api?.onFlushRequest) {
    api.onFlushRequest(() => {
      void flushNow().finally(() => api.notifyFlushDone());
    });
  }
  window.addEventListener('beforeunload', () => {
    void flushNow();
  });
}

/**
 * 订阅双 store 启动差分持久化。幂等：App 生命周期内只启动一次。
 * 返回解绑函数（测试用）。
 */
export function startPersistenceBridge(): () => void {
  if (started) return () => undefined;
  started = true;
  bindFlushHandlers();
  // 自动备份兜底：落盘触发之外，按 60s 周期检查一次（空闲会话也能备份）
  scheduler.register({ id: 'auto-backup-fallback', everyMs: 60_000, run: maybeAutoBackup });
  scheduler.start();
  const schedule = () => {
    scheduleFlush();
  };
  const unsubs = [
    useProjectStore.subscribe(schedule),
    useSettingsStore.subscribe(schedule),
  ];
  return () => {
    scheduler.stop();
    unsubs.forEach((u) => u());
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    firstDirtyAt = 0;
    started = false;
  };
}

/** 一致性哨兵：磁盘差分应该只由 store 变化驱动；测试与诊断读取上次落盘快照。 */
export function getLastPersistedSnapshot(): AppState | null {
  return lastPersisted;
}
