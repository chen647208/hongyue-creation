/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */
/**
 * 设置弹窗宿主：从 settingsStore 直读各切片并回写，保存后刷新向量服务配置。
 * 从 App.tsx 内联 JSX 收编而来，App 不再感知设置切片细节。
 */
import React from 'react';

import { vectorIntegrationService } from '@/shared/services/knowledge/vectorIntegrationService';
import { logger } from '@/shared/utils/logger';

import SettingsModal from '../../features/settings/SettingsModal';
import { getEffectiveLanguage } from '../../i18n';
import { useSettingsStore } from '../stores/settingsStore';

interface SettingsModalHostProps {
  onClose: () => void;
  onClearData: () => void;
}

const SettingsModalHost: React.FC<SettingsModalHostProps> = ({ onClose, onClearData }) => {
  const providers = useSettingsStore(s => s.providers);
  const models = useSettingsStore(s => s.models);
  const activeModelId = useSettingsStore(s => s.activeModelId);
  const prompts = useSettingsStore(s => s.prompts);
  const cardPrompts = useSettingsStore(s => s.cardPrompts);
  const consistencyPrompts = useSettingsStore(s => s.consistencyPrompts);
  const consistencyCheckConfig = useSettingsStore(s => s.consistencyCheckConfig);
  const tts = useSettingsStore(s => s.tts);
  const language = useSettingsStore(s => s.language);
  const theme = useSettingsStore(s => s.theme);
  const actions = useSettingsStore.getState();

  const handleClose = async () => {
    onClose();
    try {
      await vectorIntegrationService.refreshEmbeddingConfig();
    } catch (error) {
      logger.error('Failed to refresh embedding config:', error);
    }
  };

  return (
    <SettingsModal
      providers={providers}
      models={models}
      activeModelId={activeModelId}
      prompts={prompts}
      cardPrompts={cardPrompts}
      consistencyPrompts={consistencyPrompts}
      consistencyCheckConfig={consistencyCheckConfig}
      language={language ?? getEffectiveLanguage()}
      onLanguageChange={actions.setLanguage}
      theme={theme ?? 'light'}
      onThemeChange={actions.setTheme}
      onClose={handleClose}
      onClearData={onClearData}
      onSaveCatalog={actions.setCatalog}
      onSavePrompts={actions.setPrompts}
      onSaveCardPrompts={actions.setCardPrompts}
      onSaveConsistencyPrompts={actions.setConsistencyPrompts}
      onSaveConsistencyConfig={actions.setConsistencyConfig}
      tts={tts}
      onSaveTts={actions.setTts}
    />
  );
};

export default SettingsModalHost;
