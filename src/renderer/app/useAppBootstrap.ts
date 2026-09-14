/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 应用引导 hook：首启动加载 → 双 store 灌入 → 持久化桥启动 → 主题/语言联动。
 * App.tsx 只消费返回值，不再持有数据加载与持久化细节。
 */

import { useEffect } from 'react';

import { vectorIntegrationService } from '@/shared/services/knowledge/vectorIntegrationService';
import { normalizeProjectKinds } from '@/shared/utils/characterKinds';

import { bootCustomFonts } from '../features/settings/services/customFontService';
import { changeLanguage } from '../i18n';
import { dt } from '../i18n';
import { dialogService } from '../shared/services/dialogService';
import { offerLocalToOpfsMigration,repository } from '../shared/services/repository';
import { applyTheme, watchSystemTheme } from '../shared/services/themeService';
import { logger } from '../shared/utils/logger';
import { INITIAL_APP_STATE } from './initialState';
import { startShellSync } from './services/shellSync';
import { composeAppState, seedPersistBaseline, startPersistenceBridge } from './stores/persistenceBridge';
import { useProjectStore } from './stores/projectStore';
import { useSettingsStore } from './stores/settingsStore';

/** 把规范化 AppState 灌入双 store（首启动与全量导入共用）。 */
export function hydrateStoresFromState(state: typeof INITIAL_APP_STATE): void {
  // D4 入库迁移：人物定位/性别、时间线重要度归一化为枚举 id（幂等，老数据一次归一）
  const projects = (state.projects ?? []).map(normalizeProjectKinds);
  useProjectStore.getState().hydrate(projects, state.activeProjectId);
  useSettingsStore.getState().hydrate({
    models: state.models,
    activeModelId: state.activeModelId,
    prompts: state.prompts,
    cardPrompts: state.cardPrompts ?? [],
    consistencyPrompts: state.consistencyPrompts ?? INITIAL_APP_STATE.consistencyPrompts ?? [],
    consistencyCheckConfig: state.consistencyCheckConfig ?? INITIAL_APP_STATE.consistencyCheckConfig
      ?? { mode: 'rule', selectedPromptTemplates: {} },
    embeddingModels: state.embeddingModels,
    activeEmbeddingModelId: state.activeEmbeddingModelId,
    language: state.language,
    theme: state.theme,
    uiFont: state.uiFont,
    editorFont: state.editorFont,
    customFonts: state.customFonts ?? [],
    mcpServers: state.mcpServers ?? [],
    uiFontSize: state.uiFontSize,
    editorFontSize: state.editorFontSize,
    editorLineHeight: state.editorLineHeight,
    keybindings: state.keybindings ?? {},
    proxy: state.proxy,
    minimizeToTray: state.minimizeToTray,
    autoLaunch: state.autoLaunch,
  });
}

export function useAppBootstrap(): void {
  const theme = useSettingsStore(s => s.theme);

  useEffect(() => {
    void (async () => {
      try {
        // 后端初始化（SQLite 建表迁移 + 首启从旧 JSON 导入）；JSON 后端无此步
        await repository.init?.();
        // 启动完整性检查：损坏时提示从备份恢复，避免继续写入覆盖数据
        const integrity = await repository.checkIntegrity?.().catch(() => null);
        if (integrity && !integrity.ok) {
          void dialogService.alert(dt('app:storage.corrupt', { result: integrity.result }));
        }
        const saved = await repository.loadAll();
        if (saved) {
          logger.debug('成功加载应用状态，应用数据迁移');
          const loaded = { ...INITIAL_APP_STATE, ...saved,
            embeddingModels: saved.embeddingModels || [],
            activeEmbeddingModelId: saved.activeEmbeddingModelId || null,
          };
          hydrateStoresFromState(loaded);
          if (loaded.language) changeLanguage(loaded.language);
          applyTheme(loaded.theme);
          // 上次用 localStorage、本次 OPFS 可用时提议一次性迁移（失败保留原数据）
          void offerLocalToOpfsMigration();
        } else {
          logger.debug('没有找到保存的状态，使用初始状态');
        }
        // 建立差分基线（磁盘现状 == 组合态），再启动持久化桥
        seedPersistBaseline(composeAppState());
        // 已导入字体读回注册（逐个失败跳过，不挡启动）
        void bootCustomFonts().catch((error) => logger.error('自定义字体加载失败:', error));
        await vectorIntegrationService.initialize();
        startPersistenceBridge();
        // 托盘/自启/代理下发主进程（hydrate 之后，读到用户真实配置）
        startShellSync();
        // 用户写法技能装载（<userData>/skills/user，失败不挡启动）
        void import('../features/assistant/services/userSkillsService')
          .then((m) => m.loadUserSkills())
          .catch((error) => logger.warn('用户技能装载失败:', error));
      } catch (error) {
        logger.error('Failed to load initial state:', error);
        dialogService.alert(dt('app:storage.loadFailed', { message: error instanceof Error ? error.message : String(error) }));
      }
    })();
  }, []);

  // 偏好为 system 时跟随系统深浅变化（切换瞬时生效由 setTheme 动作完成）
  useEffect(() => {
    if ((theme ?? 'light') !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [theme]);
}
