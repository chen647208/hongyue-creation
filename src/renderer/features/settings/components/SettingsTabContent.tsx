/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React from 'react';

import { settingsTabRegistry } from '../services/settingsTabs';
import type { SettingsTabContentProps } from '../types';
import CardPromptSettingsPanel from './CardPromptSettingsPanel';
import ConsistencyPromptSettingsPanel from './ConsistencyPromptSettingsPanel';
import EmbeddingSettingsPanel from './EmbeddingSettingsPanel';
import GeneralSettingsPanel from './GeneralSettingsPanel';
import ModelSettingsPanel from './ModelSettingsPanel';
import PromptTemplatesPanel from './PromptTemplatesPanel';
import StorageSettingsPanel from './StorageSettingsPanel';
import SystemGuidePanel from './SystemGuidePanel';
import TtsSettingsPanel from './TtsSettingsPanel';

const SettingsTabContent: React.FC<SettingsTabContentProps> = (props) => {
  const {
  activeTab,
  localModels,
  activeId,
  setActiveId,
  testingId,
  testResults,
  modelListLoading,
  removeModel,
  updateModel,
  testModel,
  fetchModelList,
  addModel,
  localPrompts,
  setLocalPrompts,
  updatePrompt,
  addPrompt,
  localCardPrompts,
  editingCardPromptId,
  setEditingCardPromptId,
  cardPromptTestResult,
  importExportModalOpen,
  setImportExportModalOpen,
  importExportMode,
  setImportExportMode,
  importText,
  setImportText,
  addCardPrompt,
  removeCardPrompt,
  updateCardPrompt,
  duplicateCardPrompt,
  testCardPrompt,
  exportCardPrompts,
  importCardPrompts,
  resetCardPromptsToDefault,
  localConsistencyPrompts,
  setLocalConsistencyPrompts,
  quickAddProviderModel,
  storageConfig,
  setStorageConfig,
  onClearData,
  embeddingConfigs,
  activeEmbeddingId,
  embeddingTestingId,
  embeddingTestResults,
  embeddingModelListLoading,
  addEmbeddingConfig,
  removeEmbeddingConfig,
  updateEmbeddingConfig,
  testEmbeddingConnection,
  fetchEmbeddingModelList,
  setActiveEmbeddingConfig,
  quickAddEmbeddingConfig,
  language,
  onLanguageChange,
  theme,
  onThemeChange,
  tts,
  onTtsChange,
  } = props;
  return (
    <>
      {activeTab === 'general' && (
        <GeneralSettingsPanel
          language={language}
          onLanguageChange={onLanguageChange}
          theme={theme}
          onThemeChange={onThemeChange}
        />
      )}

      {activeTab === 'models' && (
        <ModelSettingsPanel
          localModels={localModels}
          activeId={activeId}
          setActiveId={setActiveId}
          testingId={testingId}
          testResults={testResults}
          modelListLoading={modelListLoading}
          removeModel={removeModel}
          updateModel={updateModel}
          testModel={testModel}
          fetchModelList={fetchModelList}
          addModel={addModel}
        />
      )}

      {activeTab === 'prompts' && (
        <PromptTemplatesPanel
          localPrompts={localPrompts}
          setLocalPrompts={setLocalPrompts}
          updatePrompt={updatePrompt}
          addPrompt={addPrompt}
        />
      )}

      {activeTab === 'card-prompts' && (
        <CardPromptSettingsPanel
          localCardPrompts={localCardPrompts}
          editingCardPromptId={editingCardPromptId}
          setEditingCardPromptId={setEditingCardPromptId}
          cardPromptTestResult={cardPromptTestResult}
          importExportModalOpen={importExportModalOpen}
          setImportExportModalOpen={setImportExportModalOpen}
          importExportMode={importExportMode}
          setImportExportMode={setImportExportMode}
          importText={importText}
          setImportText={setImportText}
          addCardPrompt={addCardPrompt}
          removeCardPrompt={removeCardPrompt}
          updateCardPrompt={updateCardPrompt}
          duplicateCardPrompt={duplicateCardPrompt}
          testCardPrompt={testCardPrompt}
          exportCardPrompts={exportCardPrompts}
          importCardPrompts={importCardPrompts}
          resetCardPromptsToDefault={resetCardPromptsToDefault}
        />
      )}

      {activeTab === 'consistency-prompts' && (
        <ConsistencyPromptSettingsPanel
          templates={localConsistencyPrompts}
          onTemplatesChange={setLocalConsistencyPrompts}
        />
      )}

      {activeTab === 'system' && (
        <SystemGuidePanel onQuickAddProviderModel={quickAddProviderModel} />
      )}

      {activeTab === 'storage' && (
        <StorageSettingsPanel
          storageConfig={storageConfig}
          setStorageConfig={setStorageConfig}
          onClearData={onClearData}
        />
      )}

      {settingsTabRegistry.list().map((tab) => (
        activeTab === tab.id ? <React.Fragment key={tab.id}>{tab.render(props)}</React.Fragment> : null
      ))}

      {activeTab === 'tts' && (
        <TtsSettingsPanel tts={tts} onTtsChange={onTtsChange} />
      )}

      {activeTab === 'embedding' && (
        <EmbeddingSettingsPanel
          embeddingConfigs={embeddingConfigs}
          activeEmbeddingId={activeEmbeddingId}
          embeddingTestingId={embeddingTestingId}
          embeddingTestResults={embeddingTestResults}
          embeddingModelListLoading={embeddingModelListLoading}
          addEmbeddingConfig={addEmbeddingConfig}
          removeEmbeddingConfig={removeEmbeddingConfig}
          updateEmbeddingConfig={updateEmbeddingConfig}
          testEmbeddingConnection={testEmbeddingConnection}
          fetchEmbeddingModelList={fetchEmbeddingModelList}
          setActiveEmbeddingConfig={setActiveEmbeddingConfig}
          quickAddEmbeddingConfig={quickAddEmbeddingConfig}
        />
      )}
    </>
  );
};

export default SettingsTabContent;
