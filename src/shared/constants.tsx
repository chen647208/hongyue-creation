/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */


import { type ModelConfig, type PromptTemplate, type ProviderConfig } from './types';

export const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: 'p1',
    category: 'inspiration',
    name: '经典创意生成',
    nameKey: 'prompts:p1',
    content: '根据我的这些灵感碎片：{inspiration}。请生成三个极具吸引力的小说名字和简介。格式要求：使用“1. 书名：xxx，简介：xxx”的形式。'
  },
  {
    id: 'p2',
    category: 'character',
    name: '多维角色构建',
    nameKey: 'prompts:p2',
    content: '基于小说《{title}》及其简介：{intro}。请为我构思一套完整的角色体系。包含核心主角、重要配角、关键反派。请务必使用以下格式列出每个角色（不要使用Markdown加粗）：\n\n角色名：[姓名]\n性别：[male/female/other/unknown]\n年龄：[年龄]\n角色类型：[protagonist/antagonist/supporting/other]\n性格：[性格描述]\n背景：[生平背景]\n关系：[与其他角色的关系]\n外观：[外观描述]\n标志性特征：[标志性特征]\n职业：[职业/身份]\n动机：[动机/目标]\n优势：[优势/能力]\n弱点：[弱点/缺陷]\n成长弧线：[角色成长弧线]\n---'
  },
  {
    id: 'p3',
    category: 'outline',
    name: '深度角色驱动大纲',
    nameKey: 'prompts:p3',
    content: '根据小说《{title}》，简介：{intro}。人物设定如下：{characters}。请编写一个逻辑自洽、冲突强烈的小说大纲。请使用 Markdown 结构化输出：用 # 一级标题标注全书主线，## 二级标题划分卷/幕，卷内用加粗标注关键冲突，情节要点用有序列表逐条展开，卷与卷之间用 --- 分隔线区隔。'
  },
  {
    id: 'p4',
    category: 'chapter',
    name: '全量章节细纲生成',
    nameKey: 'prompts:p4',
    content: '根据大纲：{outline}。请直接从“第一章”开始输出详细章节列表（至少20章）。格式：\n第1章：[标题]\n剧情细纲：[描述]\n---\n注意：严格使用纯文本，不要使用任何 Markdown 符号（如 # 标题、* 加粗、- 列表），每章之间用单独一行 --- 分隔。'
  },
  {
    id: 'p4-continue',
    category: 'chapter',
    name: '续写后续章节细纲',
    nameKey: 'prompts:p4-continue',
    content: '根据全书大纲：{outline}。\n\n目前已经完成了前 {count} 章的细纲，已知章节如下：\n{existing_chapters}\n\n请紧接上述内容，从“第 {next_count} 章”开始，继续输出后续的章节细纲（约20章）。请确保剧情逻辑连贯，符合大纲走向。格式保持一致：\n第N章：[标题]\n剧情细纲：[描述]\n---\n注意：严格使用纯文本，不要使用任何 Markdown 符号（如 # 标题、* 加粗、- 列表），每章之间用单独一行 --- 分隔。'
  },
  {
    id: 'p5',
    category: 'writing',
    name: '沉浸式正文创作',
    nameKey: 'prompts:p5',
    content: '根据小说大纲及角色设定，请为我创作《{title}》的正式内容。当前章节：{chapter_title}，细纲：{summary}。要求注重细节描写。以干净的小说正文散文输出，段落之间空一行，不要使用任何 Markdown 符号。'
  },
  {
    id: 'p-w2',
    category: 'writing',
    name: '智能逻辑续写',
    nameKey: 'prompts:p-w2',
    content: '请根据当前正文内容：{content}，结合本章细纲：{summary}，进行逻辑严密的续写。保持文风一致，推动剧情发展。以干净的小说正文散文输出，段落之间空一行，不要使用任何 Markdown 符号。'
  },
  {
    id: 'p6',
    category: 'edit',
    name: '文学性精修',
    nameKey: 'prompts:p6',
    content: '请对以下正文进行润色，增强文学性和情感描写：{content}'
  },
  {
    id: 'p-e2',
    category: 'edit',
    name: '细节扩充',
    nameKey: 'prompts:p-e2',
    content: '请扩充以下内容：{content}。要求增加更多环境描写、心理描写和动作细节，使其更加丰满生动。'
  },
  {
    id: 'p-e3',
    category: 'edit',
    name: '对白优化',
    nameKey: 'prompts:p-e3',
    content: '请优化以下内容中的对白：{content}。使人物性格通过对话更加鲜明，增加对话的张力和真实感。'
  },
  {
    id: 'p-s1',
    category: 'summary',
    name: '章节正文摘要提取',
    nameKey: 'prompts:p-s1',
    content: '请为以下章节正文提取一个简洁的摘要，突出主要情节、关键事件和人物发展：{content}。摘要应控制在100-200字以内，保持客观准确。'
  },
  {
    id: 'p-s2',
    category: 'summary',
    name: '智能章节摘要生成',
    nameKey: 'prompts:p-s2',
    content: '基于以下章节内容：{content}，请生成一个结构化的摘要，包含：1. 主要情节 2. 关键转折点 3. 人物表现 4. 情感基调。每个部分用简短段落描述。'
  },
  {
    id: 'p-s3',
    category: 'summary',
    name: '多章节摘要整合',
    nameKey: 'prompts:p-s3',
    content: '请为以下多个章节内容生成一个连贯的摘要：{content}。摘要应体现章节间的连贯性和剧情发展脉络，突出整体故事进展。'
  }
];

/**
 * 首启内置模型：覆盖四种通用协议 + 五家国内官方渠道，均为「只填 API Key 即可用」的官方渠道
 * （presetId 标记 + 端点预置 + 推荐模型快照，取自 models.dev，截至 2026-09）。
 * 默认激活 DeepSeek V4 Pro；未填 Key 前 isModelConfigured 判为未配置，触发首启引导。
 * 小说创作偏发散，统一给出显式温度 1.0（Anthropic 适配器会收敛到其 0–1 上限）。
 */
export const INITIAL_PROVIDERS: ProviderConfig[] = [
  { id: 'provider-deepseek', name: 'DeepSeek', provider: 'openai-chat', presetId: 'deepseek', endpoint: 'https://api.deepseek.com/v1', availableModels: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
  { id: 'provider-kimi', name: 'Kimi', provider: 'openai-chat', presetId: 'kimi', endpoint: 'https://api.moonshot.cn/v1', availableModels: ['kimi-k3', 'kimi-k2.6', 'kimi-k2.5'] },
  { id: 'provider-zhipu', name: 'GLM', provider: 'openai-chat', presetId: 'zhipu', endpoint: 'https://open.bigmodel.cn/api/paas/v4', availableModels: ['glm-5.3', 'glm-5.2', 'glm-4.7'] },
  { id: 'provider-qwen', name: '通义千问', provider: 'openai-chat', presetId: 'qwen', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', availableModels: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus'] },
  { id: 'provider-minimax', name: 'MiniMax', provider: 'anthropic', presetId: 'minimax', endpoint: 'https://api.minimaxi.com/anthropic/v1', availableModels: ['MiniMax-M3', 'MiniMax-M2.7'] },
  { id: 'provider-gemini', name: 'Gemini', provider: 'gemini', presetId: 'gemini', endpoint: '', availableModels: ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'] },
  { id: 'provider-anthropic', name: 'Anthropic', provider: 'anthropic', presetId: 'anthropic', endpoint: 'https://api.anthropic.com', availableModels: ['claude-sonnet-5', 'claude-opus-5', 'claude-sonnet-4-6'] },
  { id: 'provider-openai', name: 'OpenAI', provider: 'openai-chat', presetId: 'openai', endpoint: 'https://api.openai.com/v1', availableModels: ['gpt-5.6', 'gpt-5.5', 'gpt-5.4-mini'] },
];

export const INITIAL_MODELS: ModelConfig[] = [
  { id: 'default-deepseek', name: 'DeepSeek V4 Pro', providerId: 'provider-deepseek', modelName: 'deepseek-v4-pro', temperature: 1.0, supportsStreaming: true },
  { id: 'deepseek-flash', name: 'DeepSeek V4 Flash', providerId: 'provider-deepseek', modelName: 'deepseek-v4-flash', temperature: 1.0, supportsStreaming: true },
  { id: 'kimi-k3', name: 'Kimi K3', providerId: 'provider-kimi', modelName: 'kimi-k3', temperature: 1.0, supportsStreaming: true },
  { id: 'glm-5.3', name: 'GLM-5.3', providerId: 'provider-zhipu', modelName: 'glm-5.3', temperature: 1.0, supportsStreaming: true },
  { id: 'qwen3.8-max', name: '通义千问 Qwen3.8 Max', providerId: 'provider-qwen', modelName: 'qwen3.8-max', temperature: 1.0, supportsStreaming: true },
  { id: 'minimax-m3', name: 'MiniMax M3', providerId: 'provider-minimax', modelName: 'MiniMax-M3', temperature: 1.0, supportsStreaming: true },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', providerId: 'provider-gemini', modelName: 'gemini-3.7-flash', temperature: 1.0, supportsStreaming: true },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', providerId: 'provider-anthropic', modelName: 'claude-sonnet-5', temperature: 1.0, supportsStreaming: true },
  { id: 'gpt-5.6', name: 'GPT-5.6', providerId: 'provider-openai', modelName: 'gpt-5.6', temperature: 1.0, supportsStreaming: true },
];
