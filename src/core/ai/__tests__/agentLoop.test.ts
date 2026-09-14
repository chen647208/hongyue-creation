/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { ModelConfig } from '../../../shared/types';
import type { AgentLoopDeps } from '../agentLoop.js';
import { parseAgentReply,runAgentSession } from '../agentLoop.js';
import { ApprovalBroker, ApprovalRouter } from '../approval.js';
import { PromptAssembler } from '../promptAssembler.js';
import { AiSession } from '../session.js';
import { ToolRegistry, type ToolSpec } from '../tools.js';

const model: ModelConfig = { id: 'm', name: 'M', provider: 'openai-chat', modelName: 'test' };

const readTool: ToolSpec = {
  id: 'core.index.query',
  description: '索引查询',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  permission: 'read',
  execute: async (req) => ({ ok: true, data: { queried: (req.args as { query: string }).query } }),
};

const proposalTool: ToolSpec = {
  id: 'core.text.rewrite',
  description: '重写',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  permission: 'write:proposal',
  execute: async () => ({ ok: true, data: { rewritten: true } }),
};

function makeDeps(replies: string[], over: Partial<AgentLoopDeps> = {}): { deps: AgentLoopDeps; session: AiSession } {
  const assembler = new PromptAssembler();
  assembler.register({ id: 'identity', title: '身份', order: 10, render: () => '测试身份' });
  const registry = new ToolRegistry();
  registry.register(readTool).register(proposalTool);
  const router = new ApprovalRouter(new ApprovalBroker());
  const session = new AiSession({ sessionId: 's1', task: '任务', sections: [] });
  let i = 0;
  const complete = async () => ({ content: replies[Math.min(i++, replies.length - 1)]!, model: 'test' });
  return {
    session,
    deps: {
      assembler,
      registry,
      router,
      session,
      model,
      complete,
      context: () => ({ project: { title: '书' } }),
      ...over,
    },
  };
}

describe('parseAgentReply', () => {
  it('解析 JSON 协议', () => {
    const parsed = parseAgentReply('{"reply":"好的","toolCalls":[{"callId":"c1","toolId":"core.index.query","args":{"query":"tags"}}]}');
    expect(parsed.reply).toBe('好的');
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls![0]!.toolId).toBe('core.index.query');
  });

  it('非 JSON 输出视为最终答复', () => {
    expect(parseAgentReply('直接给你的答复')).toEqual({ reply: '直接给你的答复' });
  });

  it('过滤非法 toolCalls 条目', () => {
    const parsed = parseAgentReply('{"reply":"r","toolCalls":[{"bad":1},{"callId":"c2","toolId":"core.x"}]}');
    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls![0]!.args).toEqual({});
  });
});

describe('runAgentSession', () => {
  it('纯答复：一轮结束，事件链完整', async () => {
    const { deps, session } = makeDeps(['{"reply":"最终答案"}']);
    const result = await runAgentSession(deps, '帮我总结');
    expect(result.ok).toBe(true);
    expect(result.reply).toBe('最终答案');
    expect(result.turns).toBe(1);

    const types = session.events.map((e) => e.t);
    expect(types).toEqual(['session.start', 'turn.start', 'llm.request', 'llm.done', 'turn.end', 'session.end']);
  });

  it('工具循环：read 工具直接执行并回填，第二轮给答复', async () => {
    const { deps, session } = makeDeps([
      '{"reply":"","toolCalls":[{"callId":"c1","toolId":"core.index.query","args":{"query":"tags"}}]}',
      '{"reply":"查询完成"}',
    ]);
    const result = await runAgentSession(deps, '查标签');
    expect(result.ok).toBe(true);
    expect(result.turns).toBe(2);

    const toolEvents = session.events.filter((e) => e.t.startsWith('tool.'));
    expect(toolEvents.map((e) => e.t)).toEqual(['tool.call', 'tool.result']);
  });

  it('write:proposal 被拒时记录 tool.approval 且工具不执行', async () => {
    const { deps, session } = makeDeps([
      '{"reply":"","toolCalls":[{"callId":"c1","toolId":"core.text.rewrite","args":{"text":"x"}}]}',
      '{"reply":"收到拒绝"}',
    ]);
    // 自动拒绝所有审批
    deps.router = new ApprovalRouter(new ApprovalBroker());
    // 注册订阅：直接拒绝
    void deps.router;

    // 手动构造：在 broker 上监听并拒绝
    const broker = new ApprovalBroker();
    broker.onRequest((req) => broker.decide(req.id, 'rejected'));
    deps.router = new ApprovalRouter(broker);

    const result = await runAgentSession(deps, '重写');
    expect(result.ok).toBe(true);
    const approval = session.events.find((e) => e.t === 'tool.approval');
    expect(approval && 'verdict' in approval && approval.verdict).toBe('rejected');
    // 被拒的工具不执行：没有 tool.result 事件
    expect(session.events.some((e) => e.t === 'tool.result')).toBe(false);
  });

  it('到达轮数上限停止', async () => {
    const alwaysTool = '{"reply":"","toolCalls":[{"callId":"c","toolId":"core.index.query","args":{"query":"tags"}}]}';
    const { deps } = makeDeps([alwaysTool], { maxTurns: 2 });
    const result = await runAgentSession(deps, '循环');
    expect(result.turns).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('末轮硬切文本：上限轮不再执行工具，收口答复为准', async () => {
    const call = '{"reply":"","toolCalls":[{"callId":"c1","toolId":"core.index.query","args":{"query":"tags"}}]}';
    const { deps, session } = makeDeps([call, call, '{"reply":"收口结论"}'], { maxTurns: 2 });
    const result = await runAgentSession(deps, '长链');
    expect(result.ok).toBe(true);
    expect(result.turns).toBe(2);
    expect(result.reply).toBe('收口结论');
    // 上限轮的调用未执行：只有第一轮的 tool.result
    expect(session.events.filter((e) => e.t === 'tool.result')).toHaveLength(1);
  });

  it('同一工具组合连调三轮即判定转圈停止', async () => {
    const same = '{"reply":"","toolCalls":[{"callId":"c","toolId":"core.index.query","args":{"query":"tags"}}]}';
    const { deps } = makeDeps([same], { maxTurns: 10 });
    const result = await runAgentSession(deps, '转圈');
    expect(result.ok).toBe(true);
    expect(result.turns).toBe(3);
    expect(result.reply).toContain('重复');
  });

  it('工具执行上下文透传 modelConfig/services（宿主注入不断裂）', async () => {
    const seen: { modelConfig?: unknown; services?: unknown; project?: unknown } = {};
    const capture: ToolSpec = {
      id: 'core.ctx.capture',
      description: '捕获上下文',
      parameters: { type: 'object', properties: {} },
      permission: 'read',
      execute: async (_req, ctx) => {
        seen.modelConfig = ctx.modelConfig;
        seen.services = ctx.services;
        seen.project = ctx.project;
        return { ok: true, data: {} };
      },
    };
    const assembler = new PromptAssembler();
    assembler.register({ id: 'identity', title: '身份', order: 10, render: () => '测试身份' });
    const registry = new ToolRegistry();
    registry.register(capture);
    const session = new AiSession({ sessionId: 's-ctx', task: '任务', sections: [] });
    const result = await runAgentSession({
      assembler,
      registry,
      router: new ApprovalRouter(new ApprovalBroker()),
      session,
      model,
      complete: async () => ({
        content: '{"reply":"","toolCalls":[{"callId":"c1","toolId":"core.ctx.capture","args":{}}]}',
        model: 'test',
      }),
      context: () => ({ project: { title: '书' }, modelConfig: model, services: { textSearch: 'fn' } }),
    }, '取上下文');
    expect(result.ok).toBe(true);
    expect(seen.project).toEqual({ title: '书' });
    expect(seen.modelConfig).toBe(model);
    expect(seen.services).toEqual({ textSearch: 'fn' });
  });

  it('激活技能白名单：非白名单工具直接拦截不执行', async () => {
    const { deps, session } = makeDeps(
      [
        '{"reply":"","toolCalls":[{"callId":"c1","toolId":"core.text.rewrite","args":{"text":"x","instruction":"改"}}]}',
        '{"reply":"已拦截"}',
      ],
      {
        maxTurns: 4,
      },
    );
    const baseContext = deps.context;
    deps.context = () => ({
      ...baseContext(),
      activeSkill: { name: 'ai-flavor-removal', body: '去 AI 味' },
      activeSkillTools: ['core.index.query'],
    });
    const result = await runAgentSession(deps, '改写');
    expect(result.ok).toBe(true);
    expect(result.reply).toBe('已拦截');
    // 拦截只记 tool.result（失败），不产生 tool.approval
    expect(session.events.some((e) => e.t === 'tool.approval')).toBe(false);
    expect(session.events.filter((e) => e.t === 'tool.result')).toHaveLength(1);
  });

  it('llm 错误：会话失败收尾并带错误', async () => {
    const assembler = new PromptAssembler();
    const registry = new ToolRegistry();
    const session = new AiSession({ sessionId: 's2', task: 't', sections: [] });
    const deps: AgentLoopDeps = {
      assembler,
      registry,
      router: new ApprovalRouter(new ApprovalBroker()),
      session,
      model,
      complete: async () => ({ content: '', error: '模型超时' }),
      context: () => ({}),
    };
    const result = await runAgentSession(deps, '任务');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('模型超时');
    const end = session.events.at(-1);
    expect(end?.t).toBe('session.end');
  });

  it('写类工具执行前触发 onBeforeToolExecute，读工具不触发', async () => {
    const directTool: ToolSpec = {
      id: 'core.summary.extract',
      description: '直写',
      parameters: { type: 'object', properties: {} },
      permission: 'write:direct',
      execute: async () => ({ ok: true, data: {} }),
    };
    const assembler = new PromptAssembler();
    assembler.register({ id: 'identity', title: '身份', order: 10, render: () => '身份' });
    const registry = new ToolRegistry();
    registry.register(readTool).register(directTool);
    const session = new AiSession({ sessionId: 's-hook', task: '任务', sections: [] });
    const seen: string[] = [];
    let call = 0;
    const result = await runAgentSession({
      assembler,
      registry,
      router: new ApprovalRouter(new ApprovalBroker()),
      session,
      model,
      complete: async () => {
        call += 1;
        return call === 1
          ? {
              content: '{"reply":"","toolCalls":[{"callId":"c1","toolId":"core.index.query","args":{"query":"tags"}},{"callId":"c2","toolId":"core.summary.extract","args":{}}]}',
              model: 'test',
            }
          : { content: '{"reply":"完成","toolCalls":[]}', model: 'test' };
      },
      context: () => ({ project: { title: '书' } }),
      onBeforeToolExecute: ({ toolId }) => { seen.push(toolId); },
    }, '任务');
    expect(result.ok).toBe(true);
    expect(seen).toEqual(['core.summary.extract']);
  });
});
