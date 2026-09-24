/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * Gemini 原生适配器。
 * 三种工作模式：
 *  1. endpoint 含 /v1beta/openai/ → 委托 OpenAI 兼容适配器（复用其流式实现）
 *  2. 自定义原生 endpoint → REST generateContent / streamGenerateContent?alt=sse（真流式）
 *  3. 无 endpoint → GoogleGenAI SDK（generateContent / generateContentStream，真流式）
 *
 * 修复旧实现两处缺陷：
 *  - 旧版原生/SDK 模式一律回退非流式，现改为真流式
 *  - 旧版 SDK 调用把 systemInstruction/generationConfig 放在顶层参数（会被 SDK 忽略），
 *    现统一放入 config 字段，系统提示词真正生效
 */
import { GoogleGenAI } from '@google/genai';

import type { AIResponse, ModelConfig, StreamingAIResponse } from '../../../shared/types.js';
import { proxiedFetch } from '../../net/proxy.js';
import { aiT } from '../i18n.js';
import { cleanModelOutput, extractGeminiTokenUsage, isAbortError, readErrorResponse } from '../messages.js';
import { parseRetryAfter, requestErrorFromResponse, withRetry } from '../retry.js';
import { createSSEParser } from '../sse.js';
import { AIRequestError, type CallOptions, DEFAULT_TEMPERATURE, type ProviderAdapter } from '../types.js';
import { openAICompatibleAdapter } from './openai-compatible.js';

interface GeminiPart {
  text?: string;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

function isOpenAICompatibleEndpoint(model: ModelConfig): boolean {
  return Boolean(model.endpoint?.includes('/v1beta/openai/'));
}

function geminiRequestBody(model: ModelConfig, prompt: string, options?: CallOptions): Record<string, unknown> {
  // 附图走 inlineData（官方形态）；无图保持纯文本 parts
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const img of options?.images ?? []) {
    const base64 = img.dataUrl.includes(',') ? (img.dataUrl.split(',')[1] ?? '') : img.dataUrl;
    parts.push({ inlineData: { mimeType: img.mime, data: base64 } });
  }
  const body: Record<string, unknown> = {
    contents: [{ parts }],
  };
  const systemPrompt = model.systemPrompt?.trim();
  if (systemPrompt) {
    body.system_instruction = { parts: [{ text: systemPrompt }] };
  }
  const generationConfig: Record<string, unknown> = {};
  generationConfig.temperature = model.temperature ?? DEFAULT_TEMPERATURE;
  if (model.maxTokens !== undefined) generationConfig.maxOutputTokens = model.maxTokens;
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
  return body;
}

function geminiText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('');
}

async function postGeminiRest(
  model: ModelConfig,
  method: 'generateContent' | 'streamGenerateContent',
  prompt: string,
  options?: CallOptions,
): Promise<Response> {
  const base = (model.endpoint ?? '').replace(/\/+$/, '');
  const query = method === 'streamGenerateContent' ? '?alt=sse' : '';
  const url = `${base}/models/${encodeURIComponent(model.modelName)}:${method}${query}&key=${encodeURIComponent(model.apiKey ?? '')}`;

  const res = await proxiedFetch(url, {
    method: 'POST',
    signal: options?.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiRequestBody(model, prompt, options)),
  });

  if (!res.ok) {
    const message = await readErrorResponse(res);
    const err = requestErrorFromResponse(res.status, res.statusText, message);
    throw new AIRequestError(err.message, err.status, err.retryable, parseRetryAfter(res.headers.get('retry-after')));
  }
  return res;
}

function sdkConfig(model: ModelConfig): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  const systemPrompt = model.systemPrompt?.trim();
  if (systemPrompt) config.systemInstruction = systemPrompt;
  const generationConfig: Record<string, unknown> = {};
  generationConfig.temperature = model.temperature ?? DEFAULT_TEMPERATURE;
  if (model.maxTokens !== undefined) generationConfig.maxOutputTokens = model.maxTokens;
  if (Object.keys(generationConfig).length > 0) config.generationConfig = generationConfig;
  return config;
}

async function completeViaSDK(model: ModelConfig, prompt: string, options?: CallOptions): Promise<AIResponse> {
  const ai = new GoogleGenAI({ apiKey: model.apiKey ?? '' });
  const images = options?.images ?? [];
  // SDK contents 支持富 parts：有图则文本 + inlineData 数组，无图保持字符串（行为不变）
  const contents = images.length > 0
    ? [{ text: prompt }, ...images.map((img) => ({
        inlineData: {
          mimeType: img.mime,
          data: img.dataUrl.includes(',') ? (img.dataUrl.split(',')[1] ?? '') : img.dataUrl,
        },
      }))]
    : prompt;
  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: model.modelName,
        contents,
        config: sdkConfig(model) as never,
      }),
    { retries: options?.retries ?? 2, signal: options?.signal },
  );

  const text = typeof response.text === 'string' ? response.text : geminiText(response);
  return {
    content: cleanModelOutput(text),
    tokens: extractGeminiTokenUsage(response),
    model: model.modelName,
    metadata: { prompt, modelConfig: model },
  };
}

async function streamViaSDK(
  model: ModelConfig,
  prompt: string,
  onChunk: (response: StreamingAIResponse) => void,
  options?: CallOptions,
): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: model.apiKey ?? '' });
  const stream = await ai.models.generateContentStream({
    model: model.modelName,
    contents: prompt,
    config: sdkConfig(model) as never,
  });

  let accumulated = '';
  let finishReason: string | undefined;
  let tokens: AIResponse['tokens'];
  for await (const raw of stream as AsyncIterable<{ text?: string } & GeminiResponse>) {
    if (options?.signal?.aborted) {
      onChunk({ content: accumulated, error: aiT('streamCancelled'), isComplete: true, isStreaming: false });
      return;
    }
    // SDK 流与 REST 流对齐：逐块透出 finishReason 与用量（此前全程缺失）
    const candidate = raw.candidates?.[0];
    if (candidate?.finishReason) finishReason = candidate.finishReason;
    const usage = extractGeminiTokenUsage(raw);
    if (usage) tokens = usage;
    const delta = typeof raw.text === 'string' ? raw.text : geminiText(raw);
    if (!delta) continue;
    accumulated += delta;
    onChunk({ content: accumulated, model: model.modelName, tokens, isComplete: false, isStreaming: true });
  }

  onChunk({
    content: cleanModelOutput(accumulated),
    model: model.modelName,
    finishReason,
    tokens,
    isComplete: true,
    isStreaming: false,
    metadata: { prompt, modelConfig: model },
  });
}

export const geminiAdapter: ProviderAdapter = {
  supportsStreaming(model: ModelConfig): boolean {
    return model.supportsStreaming !== false;
  },

  async complete(model: ModelConfig, prompt: string, options?: CallOptions): Promise<AIResponse> {
    if (!model.apiKey) {
      return { content: '', error: aiT('apiKeyMissing', { provider: 'Gemini' }) };
    }
    try {
      if (isOpenAICompatibleEndpoint(model)) {
        return openAICompatibleAdapter.complete(model, prompt, options);
      }
      if (model.endpoint && model.endpoint.trim().length > 0) {
        const data = await withRetry(
          async () => {
            const res = await postGeminiRest(model, 'generateContent', prompt, options);
            return (await res.json()) as GeminiResponse;
          },
          { retries: options?.retries ?? 2, signal: options?.signal },
        );
        return {
          content: cleanModelOutput(geminiText(data)),
          tokens: extractGeminiTokenUsage(data),
          model: model.modelName,
          finishReason: data.candidates?.[0]?.finishReason,
          metadata: { prompt, modelConfig: model },
        };
      }
      return await completeViaSDK(model, prompt, options);
    } catch (error) {
      if (isAbortError(error)) {
        return { content: '', error: aiT('streamCancelled'), metadata: { prompt, modelConfig: model } };
      }
      return { content: '', error: aiT('requestFailed', { provider: 'Gemini', message: error instanceof Error ? error.message : String(error) }) };
    }
  },

  async stream(
    model: ModelConfig,
    prompt: string,
    onChunk: (response: StreamingAIResponse) => void,
    options?: CallOptions,
  ): Promise<void> {
    if (!model.apiKey) {
      onChunk({ content: '', error: aiT('apiKeyMissing', { provider: 'Gemini' }), isComplete: true });
      return;
    }
    if (model.supportsStreaming === false) {
      const response = await this.complete(model, prompt, options);
      onChunk({ ...response, isComplete: true, isStreaming: false });
      return;
    }
    if (isOpenAICompatibleEndpoint(model)) {
      return openAICompatibleAdapter.stream(model, prompt, onChunk, options);
    }
    if (model.endpoint && model.endpoint.trim().length > 0) {
      // 原生 REST 真流式：streamGenerateContent?alt=sse
      let accumulated = '';
      try {
        const res = await withRetry(
          () => postGeminiRest(model, 'streamGenerateContent', prompt, options),
          { retries: options?.retries ?? 2, signal: options?.signal },
        );
        const reader = res.body?.getReader();
        if (!reader) throw new Error(aiT('streamReadFailed'));

        const decoder = new TextDecoder();
        let tokens: AIResponse['tokens'];
        let finishReason: string | undefined;

        const parser = createSSEParser((payload) => {
          let parsed: GeminiResponse;
          try {
            parsed = JSON.parse(payload) as GeminiResponse;
          } catch {
            return;
          }
          const usage = extractGeminiTokenUsage(parsed);
          if (usage) tokens = usage;
          const delta = geminiText(parsed);
          if (delta) {
            accumulated += delta;
            onChunk({ content: accumulated, model: model.modelName, tokens, isComplete: false, isStreaming: true });
          }
          const fr = parsed.candidates?.[0]?.finishReason;
          if (fr) finishReason = fr;
        });

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) parser.push(decoder.decode(value, { stream: true }));
          }
          parser.push(decoder.decode());
          parser.flush();
        } finally {
          reader.releaseLock();
        }

        onChunk({
          content: cleanModelOutput(accumulated),
          model: model.modelName,
          finishReason,
          tokens,
          isComplete: true,
          isStreaming: false,
          metadata: { prompt, modelConfig: model },
        });
      } catch (error) {
        onChunk({
          content: accumulated,
          error: isAbortError(error) ? aiT('streamCancelled') : aiT('streamFailed', { provider: 'Gemini', message: error instanceof Error ? error.message : String(error) }),
          isComplete: true,
          isStreaming: false,
        });
      }
      return;
    }
    // SDK 真流式
    try {
      await streamViaSDK(model, prompt, onChunk, options);
    } catch (error) {
      onChunk({
        content: '',
        error: isAbortError(error) ? aiT('streamCancelled') : aiT('sdkStreamError', { provider: 'Gemini', message: error instanceof Error ? error.message : String(error) }),
        isComplete: true,
        isStreaming: false,
      });
    }
  },
};
