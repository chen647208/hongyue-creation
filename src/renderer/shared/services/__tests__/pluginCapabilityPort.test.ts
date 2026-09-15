/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { CapabilityMap, ToolProposalRequest } from '@core/plugin';
import type { ModelConfig } from '@shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/services/repository/index.js', () => ({
  repository: { search: vi.fn(), loadAll: vi.fn() },
}));
vi.mock('@/features/assistant/services/mcpProposalExecutor', () => ({
  executeMcpProposal: vi.fn(),
}));
vi.mock('@/shared/services/ai/gatewayClient', () => ({
  gatewayComplete: vi.fn(),
}));
vi.mock('@/shared/services/localInferenceService', () => ({
  resolveEffectiveModel: vi.fn(async () => undefined),
}));

import { executeMcpProposal } from '@/features/assistant/services/mcpProposalExecutor';
import { gatewayComplete } from '@/shared/services/ai/gatewayClient';
import { repository } from '@/shared/services/repository/index.js';

import { createPluginCapabilityAdapters, createPluginToolProposalPort } from '../pluginCapabilityPort';

const CTX = { pluginId: 'com.example.plugin', scriptId: 'plugin.script.x', callId: 'c1' };

function map(partial: Partial<CapabilityMap> = {}): CapabilityMap {
  return { read: [], write: [], net: false, ai: false, toolPropose: true, ...partial };
}

function request(tool: string, capabilities: CapabilityMap): ToolProposalRequest {
  return { pluginId: 'com.example.plugin', scriptId: 'plugin.script.x', capabilities, proposals: [{ tool, args: { title: 't', body: 'b' } }] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('createPluginToolProposalPort（生产工厂装配）', () => {
  it('缺省适配器齐备且可调用（不触达真实契约前不抛错）', () => {
    const adapters = createPluginCapabilityAdapters();
    expect(typeof adapters.authorize).toBe('function');
    expect(typeof adapters.execute).toBe('function');
    expect(typeof adapters.fence).toBe('function');
  });

  it('注入替身：放行读到执行回执', async () => {
    const port = createPluginToolProposalPort({}, {
      authorize: async () => ({ allowed: true }),
      execute: async () => ({ ok: true, text: '命中 3 条' }),
      fence: (text) => text,
    });
    const result = await port(request('read:cards', map({ read: ['cards'] })));
    expect(result).toEqual({ ok: true, accepted: 1, results: [{ tool: 'read:cards', text: '命中 3 条' }] });
  });

  it('注入替身：审批拒绝即整体拒绝（fail-closed）', async () => {
    const port = createPluginToolProposalPort({}, {
      authorize: async () => ({ allowed: false, reason: '用户拒绝该提议' }),
      execute: async () => ({ ok: true, text: 'should not run' }),
      fence: (text) => text,
    });
    const result = await port(request('write:cards', map({ write: ['cards'] })));
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('用户拒绝');
  });

  it('越权能力不进入审批与执行', async () => {
    let executed = 0;
    const port = createPluginToolProposalPort({}, {
      authorize: async () => ({ allowed: true }),
      execute: async () => {
        executed += 1;
        return { ok: true, text: 'x' };
      },
      fence: (text) => text,
    });
    const result = await port(request('write:secret', map({ write: ['cards'] })));
    expect(result.ok).toBe(false);
    expect(executed).toBe(0);
  });
});

describe('生产执行适配器（既有宿主契约，不依赖真实执行）', () => {
  it('read 带查询：走既有 repository.search', async () => {
    vi.mocked(repository.search).mockResolvedValue([
      { scope: 'chapter', projectId: 'p', id: '1', title: '章', snippet: '片段', rank: 0 },
    ]);
    const adapters = createPluginCapabilityAdapters();
    const result = await adapters.execute({ tool: 'read:cards', args: { query: '主角', limit: 5 } }, CTX);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain('片段');
    expect(repository.search).toHaveBeenCalledWith('主角', { limit: 5 });
  });

  it('read 无查询：投影全量状态并限上限', async () => {
    vi.mocked(repository.loadAll).mockResolvedValue({
      schemaVersion: 1,
      projects: [
        {
          id: 'p',
          title: '书',
          inspiration: '',
          intro: '',
          characters: [],
          outline: '',
          chapters: [],
          virtualChapters: [],
          knowledge: [],
          lastModified: 1,
        },
      ],
      activeProjectId: 'p',
      models: [],
      prompts: [],
      activeModelId: null,
      embeddingModels: [],
      activeEmbeddingModelId: null,
    });
    const adapters = createPluginCapabilityAdapters();
    const result = await adapters.execute({ tool: 'read:projects', args: {} }, CTX);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain('"count":1');
  });

  it('write 缺 body：拒绝且不调执行器', async () => {
    const adapters = createPluginCapabilityAdapters();
    const result = await adapters.execute({ tool: 'write:cards', args: { title: 'x' } }, CTX);
    expect(result.ok).toBe(false);
    expect(executeMcpProposal).not.toHaveBeenCalled();
  });

  it('write 有 body：交注入的提案执行器，标注插件来源', async () => {
    vi.mocked(executeMcpProposal).mockResolvedValue({ ok: true, applied: '已落到《书》' });
    const adapters = createPluginCapabilityAdapters({ executeProposal: executeMcpProposal });
    const result = await adapters.execute({ tool: 'write:cards', args: { kind: 'chapter-write', bookId: 'b', nodeId: 'n', body: '正文' } }, CTX);
    expect(result).toEqual({ ok: true, text: '已落到《书》' });
    expect(vi.mocked(executeMcpProposal).mock.calls[0]?.[1]).toContain('plugin:com.example.plugin');
  });

  it('write 缺注入：拒绝且不调执行器', async () => {
    const adapters = createPluginCapabilityAdapters();
    const result = await adapters.execute({ tool: 'write:cards', args: { body: '正文' } }, CTX);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('未注入');
  });

  it('net：走主进程受控网络门，失败回结构化原因', async () => {
    vi.stubGlobal('window', {
      electronAPI: { pluginNet: { fetch: vi.fn(async () => ({ ok: false, error: '域名不在白名单' })) } },
    });
    const adapters = createPluginCapabilityAdapters();
    const result = await adapters.execute({ tool: 'net', args: { url: 'https://x.com' } }, CTX);
    expect(result).toEqual({ ok: false, reason: '域名不在白名单' });
  });

  it('ai：走既有 AI 网关，返回内容', async () => {
    vi.mocked(gatewayComplete).mockResolvedValue({ content: '生成结果' });
    const adapters = createPluginCapabilityAdapters({ activeModel: () => ({ id: 'm1' }) as ModelConfig });
    const result = await adapters.execute({ tool: 'ai', args: { prompt: '写一句' } }, CTX);
    expect(result).toEqual({ ok: true, text: '生成结果' });
  });

  it('ai 缺注入：拒绝', async () => {
    const adapters = createPluginCapabilityAdapters();
    const result = await adapters.execute({ tool: 'ai', args: { prompt: '写一句' } }, CTX);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('未注入');
  });

  it('未知能力：拒绝', async () => {
    const adapters = createPluginCapabilityAdapters();
    const result = await adapters.execute({ tool: 'fs:/etc/passwd', args: {} }, CTX);
    expect(result.ok).toBe(false);
  });
});
