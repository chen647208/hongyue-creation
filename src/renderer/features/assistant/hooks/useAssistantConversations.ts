/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 助手多会话（对话线程）状态：会话列表、切换、新建、删除、清空与从归档恢复。
 * 服务层已按 sessionId 隔离运行；这里只维护界面层的对话线程与消息。
 */
import { type SetStateAction,useCallback, useRef, useState } from 'react';

import type { ChatMessage } from '../types';

export interface AssistantConversation {
  id: string;
  /** 自定义名称（缺席时界面取首条用户消息前若干字）。 */
  title?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** 来源归档会话 id（从归档恢复时设置）。 */
  restoredFrom?: string;
}

function createConversation(seed?: Partial<AssistantConversation>): AssistantConversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...seed,
  };
}

/** 展示标题：自定义名称优先，其次首条用户消息前若干字，最后回落默认键。 */
export function conversationDisplayTitle(conversation: AssistantConversation): string {
  if (conversation.title?.trim()) return conversation.title.trim();
  const firstUser = conversation.messages.find((m) => m.role === 'user' && m.content.trim());
  return firstUser ? firstUser.content.trim().slice(0, 24) : '';
}

export interface UseAssistantConversationsResult {
  conversations: AssistantConversation[];
  activeConversationId: string;
  activeConversation: AssistantConversation;
  /** 把某会话的消息按 updater 更新（React setState 语义）。 */
  updateMessages: (id: string, updater: SetStateAction<ChatMessage[]>) => void;
  selectConversation: (id: string) => void;
  newConversation: () => AssistantConversation;
  removeConversation: (id: string) => void;
  clearConversation: (id: string) => void;
  /** 用归档消息恢复出一个可继续对话的线程并切到它。 */
  restoreConversation: (messages: ChatMessage[], title: string, restoredFrom: string) => AssistantConversation;
}

export function useAssistantConversations(): UseAssistantConversationsResult {
  const seedRef = useRef<AssistantConversation | null>(null);
  if (!seedRef.current) seedRef.current = createConversation();
  const seed = seedRef.current;
  const [conversations, setConversations] = useState<AssistantConversation[]>([seed]);
  const [activeConversationId, setActiveConversationId] = useState<string>(seed.id);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? conversations[0] ?? seed;

  const updateMessages = useCallback((id: string, updater: SetStateAction<ChatMessage[]>) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, messages: typeof updater === 'function' ? updater(c.messages) : updater, updatedAt: Date.now() } : c)),
    );
  }, []);

  const selectConversation = useCallback((id: string) => setActiveConversationId(id), []);

  const newConversation = useCallback((): AssistantConversation => {
    const fresh = createConversation();
    setConversations((prev) => [...prev, fresh]);
    setActiveConversationId(fresh.id);
    return fresh;
  }, []);

  const removeConversation = useCallback((id: string) => {
    const remaining = conversations.filter((c) => c.id !== id);
    if (remaining.length === 0) {
      const fresh = createConversation();
      setConversations([fresh]);
      setActiveConversationId(fresh.id);
      return;
    }
    setConversations(remaining);
    setActiveConversationId((current) => {
      if (current !== id) return current;
      return remaining[remaining.length - 1]?.id ?? current;
    });
  }, [conversations]);

  const clearConversation = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, messages: [], updatedAt: Date.now() } : c)));
  }, []);

  const restoreConversation = useCallback((messages: ChatMessage[], title: string, restoredFrom: string): AssistantConversation => {
    const restored = createConversation({ messages, title, restoredFrom });
    setConversations((prev) => [...prev, restored]);
    setActiveConversationId(restored.id);
    return restored;
  }, []);

  return {
    conversations,
    activeConversationId,
    activeConversation,
    updateMessages,
    selectConversation,
    newConversation,
    removeConversation,
    clearConversation,
    restoreConversation,
  };
}
