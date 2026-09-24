/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { isVaultRef } from '@shared/constants/vault';
import React, { useEffect, useRef, useState } from 'react';

import { dt,i18n } from '@/i18n';
import { AIService } from '@/shared/services/ai/aiService';
import { getDefaultCardPrompts, validateCardPromptTemplate } from '@/shared/services/cards/cardPromptService';
import { persistApiKey, removeApiKey } from '@/shared/services/credentialService';
import { dialogService } from '@/shared/services/dialogService';
import { embeddingModelService } from '@/shared/services/embeddingModelService';
import { Dialog, DialogContent } from '@/shared/ui/Dialog';

import {
  type CardPromptTemplate,
  type ConsistencyCheckPromptTemplate,
  type EmbeddingModelConfig,
  type ModelConfig,
  type PromptTemplate,
  type StorageConfig,
} from '../../../shared/types';
import type { ModelProviderInfo } from '../../constants/modelProviders';
import { repository } from '../../shared/services/repository';
import { logger } from '../../shared/utils/logger';
import { isModelConfigured } from '../../shared/utils/modelReadiness';
import SettingsModalFooter from './components/SettingsModalFooter';
import SettingsModalHeader from './components/SettingsModalHeader';
import SettingsTabContent from './components/SettingsTabContent';
import { DEFAULT_IMPORT_EXPORT_MODE, DEFAULT_SETTINGS_TAB, DEFAULT_STORAGE_CONFIG } from './constants';
import {
  createDefaultEmbeddingConfig,
  createNewCardPromptTemplate,
  createNewModelConfig,
  createNewPromptTemplate,
  createQuickAddEmbeddingConfig,
  duplicateCardPromptTemplate,
  importCardPromptTemplates,
} from './factories';
import { ModelListService } from './services/modelListService';
import type {
  CardPromptTestResult,
  EmbeddingQuickAddTemplate,
  ImportExportMode,
  SettingsModalProps,
  SettingsTab,
} from './types';

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  models, 
  activeModelId, 
  prompts, 
  cardPrompts = [],
  consistencyPrompts = [],
  onSaveModels, 
  onSavePrompts,
  onSaveCardPrompts,
  onSaveConsistencyPrompts,
  onClose,
  onClearData,
  language,
  onLanguageChange,
  theme,
  onThemeChange
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(DEFAULT_SETTINGS_TAB);
  const [localModels, setLocalModels] = useState<ModelConfig[]>(models);
  const [activeId, setActiveId] = useState<string | null>(activeModelId);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  const [localPrompts, setLocalPrompts] = useState<PromptTemplate[]>(prompts);
  // 模型列表获取状态
  const [modelListLoading, setModelListLoading] = useState<Record<string, boolean>>({});

  // 填好凭证后自动拉取实时模型列表所需的去抖定时器与「已尝试签名」记录
  const localModelsRef = useRef<ModelConfig[]>(models);
  const autoFetchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastAutoFetchSig = useRef<Record<string, string>>({});

  // 存储配置状态
  const [storageConfig, setStorageConfig] = useState<StorageConfig>(DEFAULT_STORAGE_CONFIG);

  // Embedding模型配置状态
  const [embeddingConfigs, setEmbeddingConfigs] = useState<EmbeddingModelConfig[]>([]);
  const [activeEmbeddingId, setActiveEmbeddingId] = useState<string | null>(null);
  const [embeddingTestingId, setEmbeddingTestingId] = useState<string | null>(null);
  const [embeddingTestResults, setEmbeddingTestResults] = useState<Record<string, string>>({});
  const [embeddingModelListLoading, setEmbeddingModelListLoading] = useState<Record<string, boolean>>({});

  // AI卡片提示词配置状态
  const [localCardPrompts, setLocalCardPrompts] = useState<CardPromptTemplate[]>(cardPrompts.length > 0 ? cardPrompts : getDefaultCardPrompts());
  const [editingCardPromptId, setEditingCardPromptId] = useState<string | null>(null);
  const [cardPromptTestResult, setCardPromptTestResult] = useState<CardPromptTestResult | null>(null);
  const [importExportModalOpen, setImportExportModalOpen] = useState(false);
  const [importExportMode, setImportExportMode] = useState<ImportExportMode>(DEFAULT_IMPORT_EXPORT_MODE);
  const [importText, setImportText] = useState('');

  // 一致性检查提示词配置状态
  const [localConsistencyPrompts, setLocalConsistencyPrompts] = useState<ConsistencyCheckPromptTemplate[]>(consistencyPrompts);

  // 异步加载的基线：加载完成才确立，避免加载过程误判为脏
  const storageBaseline = useRef<StorageConfig | null>(null);
  const embeddingBaseline = useRef<{ configs: EmbeddingModelConfig[]; activeId: string | null } | null>(null);

  // 加载存储配置
  useEffect(() => {
    const loadStorageConfig = async () => {
      try {
        const config = await repository.getStorageConfig();
        setStorageConfig(config);
        if (!storageBaseline.current) storageBaseline.current = config;
      } catch (error) {
        logger.error('Failed to load storage config:', error);
      }
    };
    
    void loadStorageConfig();
  }, []);

  // 加载Embedding模型配置
  useEffect(() => {
    const loadEmbeddingConfigs = async () => {
      try {
        const configs = await embeddingModelService.getAllConfigs();
        setEmbeddingConfigs(configs);
        const activeConfig = await embeddingModelService.getActiveConfig();
        if (activeConfig) {
          setActiveEmbeddingId(activeConfig.id);
        }
        if (!embeddingBaseline.current) {
          embeddingBaseline.current = { configs, activeId: activeConfig?.id ?? null };
        }
      } catch (error) {
        logger.error('Failed to load embedding configs:', error);
      }
    };
    
    void loadEmbeddingConfigs();
  }, []);

  const addModel = () => {
    const newModel = createNewModelConfig();
    setLocalModels([...localModels, newModel]);
  };

  const removeModel = (id: string) => {
    setLocalModels(localModels.filter(m => m.id !== id));
    if (activeId === id) setActiveId(localModels[0]?.id || null);
    // vault 引用以模型 id 为键：删配置即删密钥，不留孤儿
    void removeApiKey(id);
  };

  const updateModel = (id: string, updates: Partial<ModelConfig>) => {
    const updatedModels = localModels.map(m => m.id === id ? { ...m, ...updates } : m);
    setLocalModels(updatedModels);
  };

  const testModel = async (model: ModelConfig) => {
    setTestingId(model.id);
    setTestResults(prev => ({ ...prev, [model.id]: i18n.t('settings:models.connecting') }));
    const result = await AIService.testConnection(model);
    setTestResults(prev => ({ ...prev, [model.id]: result }));
    setTestingId(null);
  };

  // 获取模型列表。silentOnError=true 用于自动获取：失败时静默保留内置推荐兜底，
  // 不打扰用户；手动点「刷新/获取模型列表」时才回显错误。
  // 传入克隆对象给 ModelListService（它会就地改写 availableModels/modelsLastFetched/
  // modelsFetchError），避免污染 React 状态对象——错误是否回显完全由本函数决定。
  const fetchModelList = async (model: ModelConfig, opts?: { silentOnError?: boolean }) => {
    setModelListLoading(prev => ({ ...prev, [model.id]: true }));
    try {
      const probe = { ...model };
      const models = await ModelListService.fetchModels(probe);
      updateModel(model.id, {
        availableModels: probe.availableModels ?? models,
        modelsLastFetched: probe.modelsLastFetched,
        modelsFetchError: undefined
      });
    } catch (error) {
      if (!opts?.silentOnError) {
        updateModel(model.id, {
          modelsFetchError: error instanceof Error ? error.message : i18n.t('settings:models.fetchListFailed')
        });
      }
    } finally {
      setModelListLoading(prev => ({ ...prev, [model.id]: false }));
    }
  };

  // 始终指向最新的 fetchModelList，供去抖定时器调用（避免闭包捕获旧引用与依赖抖动）
  const fetchModelListRef = useRef(fetchModelList);
  useEffect(() => {
    fetchModelListRef.current = fetchModelList;
  });

  // 保持 localModelsRef 指向最新模型数组，供定时器回调读取用户此刻的真实输入
  useEffect(() => {
    localModelsRef.current = localModels;
  }, [localModels]);

  // 填好 Key/端点后自动拉取官方或第三方实时模型列表；失败则静默保留内置推荐兜底。
  // 以「协议|端点|Key」为签名去抖：输入停顿 900ms 后触发一次，同签名不重复请求。
  useEffect(() => {
    for (const model of localModels) {
      if (!isModelConfigured(model)) continue;
      const sig = `${model.provider}|${model.endpoint ?? ''}|${model.apiKey ?? ''}`;
      if (lastAutoFetchSig.current[model.id] === sig) continue;
      // 缓存仍有效：视为已处理，避免重复请求
      if (model.modelsLastFetched && model.availableModels && Date.now() - model.modelsLastFetched < 60 * 60 * 1000) {
        lastAutoFetchSig.current[model.id] = sig;
        continue;
      }
      if (autoFetchTimers.current[model.id]) clearTimeout(autoFetchTimers.current[model.id]);
      autoFetchTimers.current[model.id] = setTimeout(() => {
        delete autoFetchTimers.current[model.id];
        const current = localModelsRef.current.find((m) => m.id === model.id);
        if (!current || !isModelConfigured(current)) return;
        const curSig = `${current.provider}|${current.endpoint ?? ''}|${current.apiKey ?? ''}`;
        if (lastAutoFetchSig.current[current.id] === curSig) return;
        lastAutoFetchSig.current[current.id] = curSig;
        void fetchModelListRef.current(current, { silentOnError: true });
      }, 900);
    }
  }, [localModels]);

  // 卸载时清理所有待触发的自动获取定时器
  useEffect(() => () => {
    Object.values(autoFetchTimers.current).forEach((t) => clearTimeout(t));
  }, []);


  const addPrompt = () => {
    const newPrompt = createNewPromptTemplate();
    setLocalPrompts([...localPrompts, newPrompt]);
  };

  const updatePrompt = (id: string, updates: Partial<PromptTemplate>) => {
    setLocalPrompts(localPrompts.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  // Embedding配置处理函数
  const addEmbeddingConfig = () => {
    const newConfig = createDefaultEmbeddingConfig();
    setEmbeddingConfigs([...embeddingConfigs, newConfig]);
  };

  const removeEmbeddingConfig = (id: string) => {
    setEmbeddingConfigs(embeddingConfigs.filter(c => c.id !== id));
    if (activeEmbeddingId === id) {
      setActiveEmbeddingId(null);
    }
    void removeApiKey(`embedding:${id}`);
  };

  const updateEmbeddingConfig = (id: string, updates: Partial<EmbeddingModelConfig>) => {
    const updatedConfigs = embeddingConfigs.map(c => c.id === id ? { ...c, ...updates } : c);
    setEmbeddingConfigs(updatedConfigs);
  };

  const testEmbeddingConnection = async (config: EmbeddingModelConfig) => {
    setEmbeddingTestingId(config.id);
    setEmbeddingTestResults(prev => ({ ...prev, [config.id]: i18n.t('settings:models.connecting') }));

    const result = await embeddingModelService.testConnection(config);

    // 更新配置的测试状态
    updateEmbeddingConfig(config.id, {
      testStatus: result.success ? 'success' : 'failed',
      lastTested: Date.now(),
      testError: result.error
    });

    const resultText = result.success
      ? `[SUCCESS] ${i18n.t('settings:embedding.testSuccess', { model: result.modelName, dimensions: result.dimensions, latency: result.latency })}`
      : `[ERROR] ${i18n.t('settings:embedding.testFailed', { error: result.error })}`;
    
    setEmbeddingTestResults(prev => ({ ...prev, [config.id]: resultText }));
    setEmbeddingTestingId(null);
  };

  const fetchEmbeddingModelList = async (config: EmbeddingModelConfig) => {
    setEmbeddingModelListLoading(prev => ({ ...prev, [config.id]: true }));
    try {
      const models = await embeddingModelService.fetchModels(config);
      updateEmbeddingConfig(config.id, { 
        availableModels: models,
        modelsLastFetched: Date.now()
      });
    } catch (error) {
      logger.error('获取Embedding模型列表失败:', error);
    } finally {
      setEmbeddingModelListLoading(prev => ({ ...prev, [config.id]: false }));
    }
  };

  const setActiveEmbeddingConfig = (id: string) => {
    setActiveEmbeddingId(id);
    setEmbeddingConfigs(configs => configs.map(c => ({
      ...c,
      isActive: c.id === id
    })));
  };

  const quickAddEmbeddingConfig = (template: EmbeddingQuickAddTemplate) => {
    const newConfig = createQuickAddEmbeddingConfig(template);
    setEmbeddingConfigs([...embeddingConfigs, newConfig]);
  };

  const handleGlobalSave = async () => {
    // Key 入 vault：内存明文→引用，落盘只存引用；vault 不可用则明文回落并一次性提示
    let plainFallback = 0;
    const vaultedModels = await Promise.all(
      localModels.map(async (m) => {
        if (!m.apiKey) {
          // 清空即删密钥，不留孤儿
          void removeApiKey(m.id);
          return m;
        }
        if (isVaultRef(m.apiKey)) return m;
        const { stored, encrypted } = await persistApiKey(m.id, m.apiKey);
        if (!encrypted) plainFallback += 1;
        return { ...m, apiKey: stored };
      })
    );
    const vaultedEmbeddings = await Promise.all(
      embeddingConfigs.map(async (c) => {
        if (!c.apiKey) {
          void removeApiKey(`embedding:${c.id}`);
          return c;
        }
        if (isVaultRef(c.apiKey)) return c;
        const { stored, encrypted } = await persistApiKey(`embedding:${c.id}`, c.apiKey);
        if (!encrypted) plainFallback += 1;
        return { ...c, apiKey: stored };
      })
    );
    if (plainFallback > 0) {
      dialogService.alert(i18n.t('settings:models.vaultUnavailable', { count: plainFallback }));
    }
    // 保存模型配置
    onSaveModels(vaultedModels, activeId || '');
    
    // 保存提示词配置
    onSavePrompts(localPrompts);
    
    // 保存AI卡片提示词配置
    if (onSaveCardPrompts) {
      onSaveCardPrompts(localCardPrompts);
    }
    
    // 保存一致性检查提示词配置
    if (onSaveConsistencyPrompts) {
      onSaveConsistencyPrompts(localConsistencyPrompts);
    }
    
    // 保存存储配置
    try {
      await repository.updateStorageConfig(storageConfig);
      logger.debug('Storage config saved successfully');
    } catch (error) {
      logger.error('Failed to save storage config:', error);
    }
    
    // 保存Embedding模型配置
    try {
      for (const config of vaultedEmbeddings) {
        await embeddingModelService.saveConfig(config);
      }
      if (activeEmbeddingId) {
        await embeddingModelService.setActiveConfig(activeEmbeddingId);
      }
      logger.debug('Embedding configs saved successfully');
    } catch (error) {
      logger.error('Failed to save embedding configs:', error);
    }
    
    savedRef.current = true;
    onClose();
  };

  // AI卡片提示词管理函数
  const addCardPrompt = () => {
    const newPrompt = createNewCardPromptTemplate();
    setLocalCardPrompts([...localCardPrompts, newPrompt]);
    setEditingCardPromptId(newPrompt.id);
  };

  const removeCardPrompt = (id: string) => {
    // 不允许删除默认模板
    const prompt = localCardPrompts.find(p => p.id === id);
    if (prompt?.isDefault) {
      dialogService.alert(i18n.t('settings:cardPrompts.defaultNotDeletable'));
      return;
    }
    setLocalCardPrompts(localCardPrompts.filter(p => p.id !== id));
    if (editingCardPromptId === id) {
      setEditingCardPromptId(null);
    }
  };

  const updateCardPrompt = (id: string, updates: Partial<CardPromptTemplate>) => {
    setLocalCardPrompts(localCardPrompts.map(p => p.id === id ? { ...p, ...updates } : p));
    // 清除测试结果
    if (cardPromptTestResult?.templateId === id) {
      setCardPromptTestResult(null);
    }
  };

  const duplicateCardPrompt = (id: string) => {
    const prompt = localCardPrompts.find(p => p.id === id);
    if (!prompt) return;

    const newPrompt = duplicateCardPromptTemplate(prompt);
    setLocalCardPrompts([...localCardPrompts, newPrompt]);
    setEditingCardPromptId(newPrompt.id);
  };

  const testCardPrompt = (template: CardPromptTemplate) => {
    const result = validateCardPromptTemplate(template);
    setCardPromptTestResult({
      templateId: template.id,
      isValid: result.isValid,
      errors: result.errors
    });
    return result.isValid;
  };

  const exportCardPrompts = () => {
    const data = JSON.stringify(localCardPrompts.filter(p => !p.isDefault), null, 2);
    return data;
  };

  const importCardPrompts = (jsonString: string) => {
    const result = importCardPromptTemplates(jsonString, validateCardPromptTemplate);
    if (!result.success) {
      return result;
    }

    setLocalCardPrompts([...localCardPrompts, ...(result.prompts || [])]);
    return { success: true, count: result.count };
  };

  const resetCardPromptsToDefault = async () => {
    if (await dialogService.confirm({ message: i18n.t('settings:cardPrompts.resetConfirm'), danger: true })) {
      setLocalCardPrompts(getDefaultCardPrompts());
      setEditingCardPromptId(null);
      setCardPromptTestResult(null);
    }
  };




  const quickAddProviderModel = (provider: ModelProviderInfo) => {
    const newModel: ModelConfig = {
      id: Date.now().toString(),
      name: i18n.t('settings:models.newModelName', { name: dt(provider.nameKey) }),
      provider: provider.protocol,
      isEnabled: true,
      presetId: provider.official ? provider.id : undefined,
      endpoint: provider.endpoint,
      modelName: provider.recommendedModels[0] ?? '',
      availableModels: provider.recommendedModels.length ? [...provider.recommendedModels] : undefined,
    };

    setLocalModels((currentModels) => [...currentModels, newModel]);
    setActiveId(newModel.id);
    setActiveTab('models');
  };

  // 未保存拦截：暂存区与打开时基线比对，语言/主题直写即时生效故不纳入
  // 保存后本轮不再判脏（弹窗关闭即卸载，下次打开重建基线）
  const savedRef = useRef(false);
  const isDirty = (): boolean => {
    if (savedRef.current) return false;
    const cardsBaseline = cardPrompts.length > 0 ? cardPrompts : getDefaultCardPrompts();
    if (JSON.stringify(localModels) !== JSON.stringify(models)) return true;
    if (activeId !== activeModelId) return true;
    if (JSON.stringify(localPrompts) !== JSON.stringify(prompts)) return true;
    if (JSON.stringify(localCardPrompts) !== JSON.stringify(cardsBaseline)) return true;
    if (JSON.stringify(localConsistencyPrompts) !== JSON.stringify(consistencyPrompts)) return true;
    if (storageBaseline.current && JSON.stringify(storageConfig) !== JSON.stringify(storageBaseline.current)) return true;
    if (embeddingBaseline.current) {
      if (JSON.stringify(embeddingConfigs) !== JSON.stringify(embeddingBaseline.current.configs)) return true;
      if (activeEmbeddingId !== embeddingBaseline.current.activeId) return true;
    }
    return false;
  };

  const handleRequestClose = async (): Promise<void> => {
    if (isDirty() && !(await dialogService.confirm({ message: i18n.t('settings:footer.unsavedConfirm'), danger: true }))) {
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void handleRequestClose();
      }}
    >
      <DialogContent hideClose aria-label={i18n.t('settings:title')} className="flex h-[90vh] w-[94vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <SettingsModalHeader
          activeTab={activeTab}
          onChange={setActiveTab}
          onClose={() => void handleRequestClose()}
        />
        <div className=" flex-1 overflow-y-auto bg-background p-6">
          <SettingsTabContent
            activeTab={activeTab}
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
            localPrompts={localPrompts}
            setLocalPrompts={setLocalPrompts}
            updatePrompt={updatePrompt}
            addPrompt={addPrompt}
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
            localConsistencyPrompts={localConsistencyPrompts}
            setLocalConsistencyPrompts={setLocalConsistencyPrompts}
            quickAddProviderModel={quickAddProviderModel}
            storageConfig={storageConfig}
            setStorageConfig={setStorageConfig}
            onClearData={onClearData}
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
            language={language}
            onLanguageChange={onLanguageChange}
            theme={theme}
            onThemeChange={onThemeChange}
          />
        </div>

        <SettingsModalFooter
          onClose={() => void handleRequestClose()}
          onSave={handleGlobalSave}
        />
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;








