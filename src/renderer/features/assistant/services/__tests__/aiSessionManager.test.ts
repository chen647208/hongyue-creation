/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { ApprovalBroker, SkillCatalog, ToolRegistry } from '@core/ai';
import { EventBus } from '@core/plugin';
import { beforeEach,describe, expect, it, vi } from 'vitest';

const { mockComplete } = vi.hoisted(() => ({ mockComplete: vi.fn() }));
vi.mock('@/shared/services/ai/gatewayClient.js', () => ({
  aiGatewayClient: { complete: mockComplete, stream: vi.fn() },
}));

import type { ModelConfig, Project } from '../../../../../shared/types';
import { AiSessionManager } from '../aiSessionManager';

const model: ModelConfig = { id: 'm', name: 'M', provider: 'openai-chat', modelName: 'test' };
const project = { title: '测试书' } as unknown as Project;

describe('AiSessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // node 测试环境：stub window，走无 electronAPI 的无落盘路径
    vi.stubGlobal('window', { electronAPI: undefined });
  });

  it('无落盘环境下运行完整会话并保留事件', async () => {
    const { PromptAssembler } = await import('@core/ai');
    const assembler = new PromptAssembler();
    assembler.register({ id: 'identity', title: '身份', order: 10, render: () => '身份' });
    const manager = new AiSessionManager({
      assembler,
      registry: new ToolRegistry(),
      catalog: new SkillCatalog(),
      broker: new ApprovalBroker(),
      events: new EventBus(),
    });
    mockComplete.mockResolvedValue({ content: '{"reply":"回答"}', model: 'test' });

    const result = await manager.run({ bookId: 'b1', task: '写一段', project, model });
    expect(result.ok).toBe(true);
    expect(result.reply).toBe('回答');

    const types = manager.getEvents().map((e) => e.t);
    expect(types[0]).toBe('session.start');
    expect(types.at(-1)).toBe('session.end');
    expect(manager.pendingCount).toBe(0);
  });

  it('触发词命中的技能会话内激活、结束即卸载', async () => {
    const { PromptAssembler, parseSkillMd } = await import('@core/ai');
    const catalog = new SkillCatalog();
    const parsed = parseSkillMd(
      '---\nname: pov-switch\ndescription: POV 切换技巧。触发词：pov\n---\n方法论正文',
      'builtin',
    );
    catalog.register(parsed.skill!);

    const assembler = new PromptAssembler();
    assembler.register({ id: 'identity', title: '身份', order: 10, render: () => '身份' });
    const manager = new AiSessionManager({
      assembler,
      registry: new ToolRegistry(),
      catalog,
      broker: new ApprovalBroker(),
      events: new EventBus(),
    });

    // 捕获每轮装配时 catalog.getActive() 的可见性
    const seen: Array<string | null> = [];
    mockComplete.mockImplementation(async () => {
      seen.push(catalog.getActive()?.name ?? null);
      return { content: '{"reply":"ok"}', model: 'test' };
    });

    await manager.run({ task: '帮我看这段 POV 切换', project, model });
    expect(seen).toEqual(['pov-switch']);
    expect(catalog.getActive()).toBeNull();
  });

  it('无触发词命中时无技能注入', async () => {
    const { PromptAssembler } = await import('@core/ai');
    const manager = new AiSessionManager({
      assembler: new PromptAssembler(),
      registry: new ToolRegistry(),
      catalog: new SkillCatalog(),
      broker: new ApprovalBroker(),
      events: new EventBus(),
    });
    mockComplete.mockResolvedValue({ content: '{"reply":"r"}', model: 'test' });
    const result = await manager.run({ task: '普通任务', project, model });
    expect(result.ok).toBe(true);
  });

  it('历史轮次经 history section 注入装配', async () => {
    const { PromptAssembler, historySection } = await import('@core/ai');
    const assembler = new PromptAssembler();
    assembler.register({ id: 'identity', title: '身份', order: 10, render: () => '身份' });
    assembler.register(historySection);
    const manager = new AiSessionManager({
      assembler,
      registry: new ToolRegistry(),
      catalog: new SkillCatalog(),
      broker: new ApprovalBroker(),
      events: new EventBus(),
    });
    let seenPrompt = '';
    mockComplete.mockImplementation(async (_model: unknown, prompt: string) => {
      seenPrompt = prompt;
      return { content: '{"reply":"r"}', model: 'test' };
    });
    await manager.run({
      task: '改一下',
      project,
      model,
      history: [
        { role: 'user', content: '主角叫什么' },
        { role: 'assistant', content: '叫林渊' },
      ],
    });
    expect(seenPrompt).toContain('林渊');
  });

  it('并行会话：事件与注入按会话 id 隔离，互不覆盖', async () => {
    const { EventBus } = await import('@core/plugin');
    const { PromptAssembler, SkillCatalog, ToolRegistry, ApprovalBroker, parseSkillMd } = await import('@core/ai');
    const catalog = new SkillCatalog();
    catalog.register(parseSkillMd('---\nname: pov-switch\ndescription: 视角。触发词：pov\n---\n正文', 'builtin').skill!);
    const manager = new AiSessionManager({
      assembler: new PromptAssembler(),
      registry: new ToolRegistry(),
      catalog,
      broker: new ApprovalBroker(),
      events: new EventBus(),
    });

    // 闸门：两个会话同时停在 complete 处，验证在飞状态下的隔离
    const gates: Array<() => void> = [];
    mockComplete.mockImplementation(async () => {
      await new Promise<void>((resolve) => gates.push(resolve));
      return { content: '{"reply":"ok"}', model: 'test' };
    });

    const p1 = manager.run({ task: 'POV 任务甲', project, model });
    const p2 = manager.run({ task: '普通任务乙', project, model, injectionEnabled: false });
    for (let i = 0; i < 50 && gates.length < 2; i += 1) await new Promise((r) => setTimeout(r, 0));
    expect(gates).toHaveLength(2);

    const ids = manager.listSessionIds();
    expect(ids).toHaveLength(2);
    // 两个会话各自持有独立事件数组
    expect(manager.getEvents(ids[0])).not.toBe(manager.getEvents(ids[1]));
    const byTask = (task: string): string =>
      ids.find((id) => manager.getEvents(id).some((e) => e.t === 'session.start' && e.task === task))!;
    const idA = byTask('POV 任务甲');
    const idB = byTask('普通任务乙');
    expect(idA).not.toBe(idB);
    // 注入上下文按会话隔离：乙关闭注入，甲保持默认开启
    expect(manager.getLastInjection(idA)?.enabled).toBe(true);
    expect(manager.getLastInjection(idB)?.enabled).toBe(false);
    // 甲涉及 POV 触发词，激活仅作用于甲的 scope；乙看不到
    expect(catalog.getActive(idA)?.name).toBe('pov-switch');
    expect(catalog.getActive(idB)).toBeNull();

    gates.forEach((g) => g());
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.sessionId).toBe(idA);
    expect(r2.sessionId).toBe(idB);
    expect(manager.getEvents(idA).at(-1)?.t).toBe('session.end');
    expect(manager.getEvents(idB).at(-1)?.t).toBe('session.end');
    // 会话结束后技能 scope 卸载
    expect(catalog.getActive(idA)).toBeNull();
  });

  it('无历史时 history section 缺席', async () => {
    const { PromptAssembler, historySection } = await import('@core/ai');
    const assembler = new PromptAssembler();
    assembler.register({ id: 'identity', title: '身份', order: 10, render: () => '身份' });
    assembler.register(historySection);
    const manager = new AiSessionManager({
      assembler,
      registry: new ToolRegistry(),
      catalog: new SkillCatalog(),
      broker: new ApprovalBroker(),
      events: new EventBus(),
    });
    let seenPrompt = '';
    mockComplete.mockImplementation(async (_model: unknown, prompt: string) => {
      seenPrompt = prompt;
      return { content: '{"reply":"r"}', model: 'test' };
    });
    await manager.run({ task: '普通任务', project, model });
    expect(seenPrompt).not.toContain('会话历史');
  });
});
