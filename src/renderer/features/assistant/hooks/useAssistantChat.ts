/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 助手聊天编排（从 GlobalAssistant 抽出）：消息流、输入、发送/重试/停止、
 * 会话记忆、卡片模板选择。卡片落库经 addCardToProject 回调交回组件（保持归因与审批语义）。
 */
import type { Citation, ContextInjectionResult } from '@core/ai';
import { inferContextTarget } from '@core/ai';
import { indexService } from '@core/index';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';

import { AICardCommandService } from '@/shared/services/cards/aiCardCommandService';
import { AICardCreationService } from '@/shared/services/cards/aiCardCreationService';
import { getDefaultCardPrompts } from '@/shared/services/cards/cardPromptService';
import { isModelUsable } from '@/shared/utils/modelReadiness';

import { ATTACHMENT_TRUNCATE } from '../../../../shared/constants/chapters';
import {
  type AICardCommand,
  type AIMessageImage,
  type CardPromptTemplate,
  type CreatedCard,
  type KnowledgeItem,
  type ModelConfig,
  type Project,
} from '../../../../shared/types';
import { approvalBroker, sessionManager } from '../services/aiRuntime';
import type { SessionRunResult } from '../services/aiSessionManager';
import { assistantTaskService } from '../services/assistantTaskService';
import { type ChatMessage } from '../types';
import { useAssistantHistory } from './useAssistantHistory';

export interface PendingImage {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
}

interface UseAssistantChatOptions {
  project: Project | null;
  usableModel: ModelConfig | undefined;
  models: ModelConfig[];
  hasModel: boolean;
  addCardToProject: (command: AICardCommand, data: CreatedCard) => void;
  t: TFunction<'assistant'>;
  language: string;
  /** 自动上下文注入总开关（关闭即纯手动）。 */
  injectionEnabled?: boolean;
  /** 单条关闭的注入条目 id。 */
  disabledInjectionIds?: string[];
}

/** 从会话事件收集本轮检索引用（带出处），按 anchor 去重。 */
function collectCitations(events: ReturnType<typeof sessionManager.getEvents>): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const event of events) {
    if (event.t !== 'tool.result' || !event.citations) continue;
    for (const citation of event.citations) {
      if (seen.has(citation.id)) continue;
      seen.add(citation.id);
      citations.push(citation);
    }
  }
  return citations;
}

export function useAssistantChat({
  project,
  usableModel,
  models,
  hasModel,
  addCardToProject,
  t,
  language,
  injectionEnabled = true,
  disabledInjectionIds,
}: UseAssistantChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // 计划模式：只出计划不执行（codex /plan 同语义，指令级；批准=下一条发送执行）
  const [planMode, setPlanMode] = useState(false);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  // 本轮工具调用链（codex 式内联折叠，免跳事件浏览器）
  const [lastToolChain, setLastToolChain] = useState<Array<{ toolId: string; ok: boolean }>>([]);
  // 会话记忆（docs/design/11）：超长压缩后的摘要存这里，后续发送拼在历史最前
  const [historySummary, setHistorySummary] = useState('');
  const lastUserText = useRef('');
  const [pendingFiles, setPendingFiles] = useState<KnowledgeItem[]>([]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [cardPromptTemplates, setCardPromptTemplates] = useState<CardPromptTemplate[]>([]);
  const [selectedCardTemplateId, setSelectedCardTemplateId] = useState<string | null>(null);
  const [lastInjection, setLastInjection] = useState<ContextInjectionResult | null>(null);
  const streamAbortRef = useRef<string | null>(null);

  useEffect(() => {
    setCardPromptTemplates(getDefaultCardPrompts());
  }, []);

  /**
   * 组装本轮携带的历史（实现见 useAssistantHistory）。
   */
  const { buildHistoryTurns } = useAssistantHistory({ messages, historySummary, setHistorySummary });

  const sendMessageInternal = async (text: string, attachments: KnowledgeItem[], images: AIMessageImage[] = []) => {
    if (project && AICardCommandService.isValidCommand(text)) {
      setIsLoading(true);

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, userMsg]);

      const activeModel = usableModel;

      if (!isModelUsable(activeModel)) {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: t('chat.modelMissing'),
          timestamp: Date.now(),
          error: t('chat.modelMissingError'),
        };
        setMessages(prev => [...prev, errorMsg]);
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: t('chat.unknownCommand', { text }),
          timestamp: Date.now(),
          error: t('chat.creationFailed'),
        }]);
        setIsLoading(false);
        return;
      }

      const selectedTemplate = selectedCardTemplateId
        ? cardPromptTemplates.find(tpl => tpl.id === selectedCardTemplateId)
        : undefined;

      const result = await AICardCreationService.processInput(text, project, activeModel, selectedTemplate);

      if (result) {
        if (result.success && result.data) {
          // 斜杠建卡同样走审批：先弹框确认，批准后落库（与 Agent 工具同标准）
          const decision = await approvalBroker.request({
            callId: `cmd_${Date.now().toString(36)}`,
            toolId: 'core.card.generate',
            permission: 'write:proposal',
            proposal: {
              title: result.message,
              summary: t('chat.cardApprovalHint'),
              suggestion: JSON.stringify(result.data, null, 2)?.slice(0, 2000),
            },
          });
          const applied = decision.verdict === 'approved';
          if (applied) {
            addCardToProject(result.command, result.data);
          }

          const systemMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: applied
              ? result.message
              : decision.verdict === 'rejected'
                ? t('chat.cardRejected')
                : t('chat.cardDeferred'),
            timestamp: Date.now(),
            error: applied ? undefined : t('chat.creationPending'),
          };
          setMessages(prev => [...prev, systemMsg]);
        } else {
          const errorMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.message,
            timestamp: Date.now(),
            error: t('chat.creationFailed'),
          };
          setMessages(prev => [...prev, errorMsg]);
        }
        setIsLoading(false);
        return; // 跳过正常的AI对话流程
      }

      setIsLoading(false);
      return;
    }

    // ── Agent 循环：装配 → 网关 → 工具（三档审批）→ 答复 ──
    setIsLoading(true);
    lastUserText.current = text;

    const activeModel = usableModel;
    if (!isModelUsable(activeModel)) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('chat.modelMissing'),
        timestamp: Date.now(),
        error: t('chat.modelMissingError'),
      }]);
      setIsLoading(false);
      return;
    }

    // 用户消息进历史流（Agent 分支此前漏推，聊天区只见答复不见问）
    // 图片名取 state（调用时刻即最新；重试路径图片已清空，不会误标）
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user' as const,
      content: attachments.length > 0 || pendingImages.length > 0
        ? `${text}\n${[...attachments.map((f) => `[附件：${f.name}]`), ...pendingImages.map((f) => `[图片：${f.name}]`)].join(' ')}`
        : text,
      timestamp: Date.now(),
    }]);

    // Agent 整轮可停止：停止键靠该 id 显示，中止经 signal 传入循环
    setStreamingMessageId('agent');
    setLastToolChain([]);

    let taskText = text;
    if (planMode) {
      taskText = language.startsWith('en')
        ? `【PLAN MODE】Output ONLY a numbered execution plan (steps, tools involved, risks). Do NOT call any tools or execute. Wait for user confirmation.\n\n${text}`
        : `【计划模式】只输出执行计划（编号步骤清单，含涉及的工具与风险点），不要调用任何工具，不要执行。等用户确认后再行动。\n\n${text}`;
    }
    if (attachments && attachments.length > 0) {
      const fileContent = attachments.map(f => `[参考内容: ${f.name}]\n${f.content.substring(0, ATTACHMENT_TRUNCATE)}... (内容过长已截断)`).join('\n\n');
      taskText += `\n\n### 附带参考资料:\n${fileContent}`;
    }

    // 会话记忆：本次发送前已落盘的消息（不含刚推入的本轮） + 摘要
    const history = await buildHistoryTurns(activeModel);

    // 交给后台任务服务：面板关闭/切换书籍不中止；同一时刻串行执行
    const taskHandle = assistantTaskService.enqueue({
      bookId: project?.id,
      label: text,
      run: (signal) => sessionManager.run({
        bookId: project?.id,
        task: taskText,
        project,
        index: (project && indexService.snapshot(project.id)) || undefined,
        model: activeModel,
        fallbackModel: models.find((m) => m.id !== activeModel?.id && m.isEnabled !== false && isModelUsable(m)),
        history,
        images,
        // 上下文注入（design/37）：按任务文本推断章节/实体目标，开关与单条关闭由此透传
        contextTarget: inferContextTarget(project, text),
        injectionEnabled,
        disabledInjectionIds,
        cardTemplate: selectedCardTemplateId
          ? cardPromptTemplates.find((tpl) => tpl.id === selectedCardTemplateId)
          : undefined,
        signal,
      }),
    });
    streamAbortRef.current = taskHandle.id;

    const outcome = await taskHandle.result;
    streamAbortRef.current = null;
    setStreamingMessageId(null);
    const result = outcome.value as SessionRunResult | undefined;
    if (!result) {
      // 中止（排队中移除或运行中被取消）：不追加答复
      setIsLoading(false);
      return;
    }
    // 按本会话 id 读取事件（并行任务各读各的，不串到最近一次会话）
    const sessionEvents = sessionManager.getEvents(result.sessionId);
    // 本轮工具链快照：callId 关联调用与结果，供聊天区折叠展示
    try {
      const names = new Map<string, string>();
      const results = new Map<string, boolean>();
      for (const e of sessionEvents) {
        if (e.t === 'tool.call' && typeof e.callId === 'string' && typeof e.toolId === 'string') {
          names.set(e.callId, e.toolId);
          if (!results.has(e.callId)) results.set(e.callId, true);
        } else if (e.t === 'tool.result' && typeof e.callId === 'string') {
          results.set(e.callId, e.ok !== false);
        }
      }
      setLastToolChain([...results].map(([callId, ok]) => ({ toolId: names.get(callId) ?? callId, ok })));
    } catch {
      // 事件读取失败不影响主流程
    }
    const citations = collectCitations(sessionEvents);
    setLastInjection(sessionManager.getLastInjection(result.sessionId));
    setMessages(prev => [...prev, {
      id: (Date.now() + 1).toString(),
      role: 'assistant' as const,
      content: result.ok ? result.reply : (result.error ?? t('chat.callFailedContent')),
      timestamp: Date.now(),
      error: result.ok ? undefined : t('chat.callFailed'),
      citations: citations.length ? citations : undefined,
    }]);
    setIsLoading(false);
  };

  const handleSendMessage = () => {
    // 允许在上一条运行中继续发送：任务服务串行排队（后台多任务）
    if (!input.trim() && pendingFiles.length === 0 && pendingImages.length === 0) return;
    void sendMessageInternal(input, [...pendingFiles], pendingImages.map(({ mime, dataUrl }) => ({ mime, dataUrl })));
    setInput('');
    setPendingFiles([]);
    setPendingImages([]);
    // 卡片模板只跟随选定的那一次发送，下次普通问答不再携带
    setSelectedCardTemplateId(null);
  };

  const handleStopStreaming = () => {
    // 先真正中止底层请求，再复位 UI 状态
    if (streamAbortRef.current) assistantTaskService.abort(streamAbortRef.current);
    streamAbortRef.current = null;
    if (streamingMessageId) {
      setMessages(prev => prev.map(msg => {
        if (msg.id === streamingMessageId) {
          return { ...msg, isStreaming: false };
        }
        return msg;
      }));
      setStreamingMessageId(null);
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    // 重新生成：旧答案保留在历史流，按上轮原文重跑（与发送键同口径守卫）
    if (isLoading || !lastUserText.current.trim() || !hasModel) return;
    void sendMessageInternal(lastUserText.current, []);
  };

  const handleClearChat = () => {
    setMessages([]);
    setHistorySummary('');
    lastUserText.current = '';
  };

  return {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    planMode,
    setPlanMode,
    pendingImages,
    setPendingImages,
    pendingFiles,
    setPendingFiles,
    lastToolChain,
    streamingMessageId,
    cardPromptTemplates,
    selectedCardTemplateId,
    setSelectedCardTemplateId,
    lastInjection,
    sendMessageInternal,
    handleSendMessage,
    handleStopStreaming,
    handleRetry,
    handleClearChat,
    lastUserText,
  };
}
