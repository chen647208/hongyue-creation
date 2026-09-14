/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { i18n } from '@/i18n';
import { gatewayHttp } from '@/shared/services/ai/gatewayClient';

import { type ModelConfig } from '../../../../shared/types';
import { asRecord, asRecords, asStr } from '../../../shared/utils/loose';

export class ModelListService {
  // 缓存时间：1小时
  private static readonly CACHE_DURATION = 60 * 60 * 1000;
  
  // 从模型提供商API获取模型列表
  static async fetchModels(model: ModelConfig): Promise<string[]> {
    // 检查缓存是否有效
    if (this.isCacheValid(model)) {
      return model.availableModels || [];
    }
    
    // 标记为正在获取
    model.isFetchingModels = true;
    
    try {
      let models: string[] = [];
      
      // Key 由主进程网关解引用注入，渲染端不持有明文
      switch (model.provider) {
        case 'openai-chat':
        case 'openai-responses':
          models = await this.fetchFromOpenAICompatible(model);
          break;
        case 'ollama':
          models = await this.fetchFromOllama(model);
          break;
        case 'anthropic':
          models = await this.fetchFromAnthropic(model);
          break;
        case 'gemini':
          models = await this.fetchFromGemini(model);
          break;
        default:
          models = [];
      }
      
      // 更新缓存：仅当拿到非空列表才覆盖既有（内置推荐）并写入缓存时间；
      // 空结果保留内置兜底，且不写时间以便下次重试。
      if (models.length > 0) {
        model.availableModels = models;
        model.modelsLastFetched = Date.now();
      }
      model.modelsFetchError = undefined;

      return model.availableModels ?? models;
    } catch (error) {
      model.modelsFetchError = error instanceof Error ? error.message : i18n.t('settings:models.fetchListFailed');
      throw error;
    } finally {
      model.isFetchingModels = false;
    }
  }
  
  // 从OpenAI兼容API获取模型列表
  private static async fetchFromOpenAICompatible(model: ModelConfig): Promise<string[]> {
    const endpoint = model.endpoint?.replace(/\/+$/, '') || '';
    if (!endpoint) {
      throw new Error(i18n.t('errors:endpointMissingGeneric'));
    }
    
    const url = `${endpoint}/models`;
    
    const response = await gatewayHttp({
      url,
      headers: { 'Content-Type': 'application/json' },
      apiKeyRef: model.apiKey,
    });
    
    if (!response.ok) {
      throw new Error(i18n.t('errors:requestFailedStatus', { status: response.status, detail: response.statusText }));
    }
    const data = asRecord(JSON.parse(response.text) as unknown);
    return asRecords(data.data).map((m) => asStr(m.id)).filter((id) => id !== "");
  }
  
  // 从 Anthropic Messages API 获取模型列表（x-api-key 鉴权，非 Bearer）
  private static async fetchFromAnthropic(model: ModelConfig): Promise<string[]> {
    const base = (model.endpoint?.replace(/\/+$/, '') || '');
    if (!base) {
      throw new Error(i18n.t('errors:endpointMissingGeneric'));
    }
    const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
    
    const response = await gatewayHttp({
      url,
      headers: {
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      apiKeyRef: model.apiKey,
      apiKeyHeader: 'x-api-key',
      apiKeyScheme: 'raw',
    });
    
    if (!response.ok) {
      throw new Error(i18n.t('errors:requestFailedStatus', { status: response.status, detail: response.statusText }));
    }
    const data = asRecord(JSON.parse(response.text) as unknown);
    return asRecords(data.data).map((m) => asStr(m.id)).filter((id) => id !== "");
  }
  
  // 从Ollama获取模型列表
  private static async fetchFromOllama(model: ModelConfig): Promise<string[]> {
    const endpoint = model.endpoint?.replace(/\/+$/, '') || 'http://localhost:11434';
    const url = `${endpoint}/api/tags`;
    
    const response = await gatewayHttp({ url });
    
    if (!response.ok) {
      throw new Error(i18n.t('errors:requestFailed', { provider: 'Ollama', message: `${response.status} ${response.statusText}` }));
    }
    const data = asRecord(JSON.parse(response.text) as unknown);
    return asRecords(data.models).map((m) => asStr(m.name)).filter((n) => n !== "");
  }
  
  // 从 Gemini 获取模型列表：官方走原生 generativelanguage 列表端点（只需 Key），
  // 显式 OpenAI 兼容代理端点则委托通用 /models。
  private static async fetchFromGemini(model: ModelConfig): Promise<string[]> {
    const ep = model.endpoint?.replace(/\/+$/, '') || '';
    if (ep.includes('/openai')) {
      return this.fetchFromOpenAICompatible(model);
    }
    const base = ep || 'https://generativelanguage.googleapis.com/v1beta';
    const url = `${base}/models`;

    const response = await gatewayHttp({
      url,
      headers: { 'Content-Type': 'application/json' },
      apiKeyRef: model.apiKey,
      apiKeyQueryParam: 'key',
    });

    if (!response.ok) {
      throw new Error(i18n.t('errors:requestFailedStatus', { status: response.status, detail: response.statusText }));
    }
    const data = asRecord(JSON.parse(response.text) as unknown);
    return asRecords(data.models)
      .map((m) => asStr(m.name).replace(/^models\//, ''))
      .filter((id) => id !== '');
  }
  
  // 检查缓存是否有效
  private static isCacheValid(model: ModelConfig): boolean {
    if (!model.modelsLastFetched || !model.availableModels) {
      return false;
    }
    
    const now = Date.now();
    return (now - model.modelsLastFetched) < this.CACHE_DURATION;
  }
  
  // 清除缓存
  static clearCache(model: ModelConfig): void {
    model.availableModels = undefined;
    model.modelsLastFetched = undefined;
    model.modelsFetchError = undefined;
  }
  
}





