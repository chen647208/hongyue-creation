/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

// @vitest-environment jsdom

import { act,renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '../../types';
import { conversationDisplayTitle,useAssistantConversations } from '../useAssistantConversations';

function message(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return { id, role, content, timestamp: 0 };
}

describe('useAssistantConversations', () => {
  it('初始一个空对话，updateMessages 按会话写入', () => {
    const { result } = renderHook(() => useAssistantConversations());
    expect(result.current.conversations).toHaveLength(1);
    const id = result.current.activeConversationId;
    act(() => result.current.updateMessages(id, [message('m1', 'user', '你好')]));
    expect(result.current.activeConversation.messages).toHaveLength(1);
  });

  it('新建/切换/删除保持至少一个对话', () => {
    const { result } = renderHook(() => useAssistantConversations());
    const first = result.current.activeConversationId;
    let second = '';
    act(() => { second = result.current.newConversation().id; });
    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.activeConversationId).toBe(second);
    act(() => result.current.selectConversation(first));
    expect(result.current.activeConversationId).toBe(first);
    act(() => result.current.removeConversation(second));
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeConversationId).toBe(first);
    act(() => result.current.removeConversation(first));
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0]!.messages).toHaveLength(0);
  });

  it('clearConversation 清空消息', () => {
    const { result } = renderHook(() => useAssistantConversations());
    const id = result.current.activeConversationId;
    act(() => result.current.updateMessages(id, [message('m1', 'user', '甲')]));
    act(() => result.current.clearConversation(id));
    expect(result.current.activeConversation.messages).toHaveLength(0);
  });

  it('restoreConversation 用归档消息新建并激活线程', () => {
    const { result } = renderHook(() => useAssistantConversations());
    let restoredId = '';
    act(() => {
      restoredId = result.current.restoreConversation([message('r1', 'user', '旧问'), message('r2', 'assistant', '旧答')], '旧会话', 'sess_1').id;
    });
    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.activeConversationId).toBe(restoredId);
    expect(result.current.activeConversation.restoredFrom).toBe('sess_1');
    expect(conversationDisplayTitle(result.current.activeConversation)).toBe('旧会话');
  });

  it('conversationDisplayTitle 无标题时取首条用户消息', () => {
    expect(conversationDisplayTitle({ id: 'x', messages: [message('m', 'user', '帮我写第一章的开头')], createdAt: 0, updatedAt: 0 }))
      .toBe('帮我写第一章的开头');
  });
});
