/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import type { ScriptDescriptor } from '../descriptors.js';
import type { ScriptExecutionPort, ToolProposalPort, ToolProposalRequest } from '../execution.js';
import type { PluginManifest, PluginPermissions } from '../manifest.js';
import { ScriptRegistry } from '../registries.js';
import { PluginHost } from '../runtime.js';
import type { SandboxRunRequest, SandboxRunResult } from '../sandbox/types.js';

const PLUGIN_ID = 'com.example.plugin';
const REGISTERED_ID = 'plugin.script.on-open';

const SCRIPT: ScriptDescriptor = {
  id: 'on-open',
  entry: 'scripts/open.js',
  export: 'onOpen',
  purity: 'effectful',
  mode: 'async',
  on: 'chapter.open',
  capabilities: ['write:cards'],
  output: { type: 'string' },
};

function manifest(permissions: PluginPermissions): PluginManifest {
  return {
    id: PLUGIN_ID,
    name: 'plugin',
    version: '1.0.0',
    host: '^2.0.0',
    license: 'MIT',
    permissions,
    contributes: { scripts: ['./scripts/'] },
  };
}

interface HostOptions {
  permissions?: PluginPermissions;
  script?: ScriptDescriptor;
  execution?: ScriptExecutionPort;
  toolProposal?: ToolProposalPort;
}

function makeHost(options: HostOptions = {}): PluginHost {
  const scripts = new ScriptRegistry();
  scripts.register(PLUGIN_ID, options.script ?? SCRIPT);
  const host = new PluginHost(
    { hostVersion: '2.0.0', scripts, scriptExecution: options.execution, toolProposal: options.toolProposal },
    () => [],
  );
  host.loadRaw(
    PLUGIN_ID,
    manifest(options.permissions ?? { write: ['cards'] }),
    { 'scripts/open.js': 'export function onOpen() { return "hi"; }' },
    true,
  );
  return host;
}

function recordingPort(sink: SandboxRunRequest[]): ScriptExecutionPort {
  return (request) => {
    sink.push(request);
    return Promise.resolve({ ok: true, output: 'hello' });
  };
}

describe('PluginHost.runScript 执行门控', () => {
  it('已激活：放行到执行端口并按描述符定位入口', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({ execution: recordingPort(calls) });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', { value: 1 });

    expect(result.ok).toBe(true);
    expect(result.output).toBe('hello');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.code).toContain('globalThis.run = typeof onOpen');
    expect(calls[0]?.input).toEqual({ value: 1 });
  });

  it('接受插件内局部脚本 id', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({ execution: recordingPort(calls) });
    host.activate(PLUGIN_ID);
    const result = await host.runScript(PLUGIN_ID, 'on-open', 'chapter.open', {});
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('未激活：拒绝且不进执行端口', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({ execution: recordingPort(calls) });

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
    expect(result.error?.message).toContain('未激活');
    expect(calls).toHaveLength(0);
  });

  it('未注册脚本：拒绝且不进执行端口', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({ execution: recordingPort(calls) });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, 'on-close', 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
    expect(result.error?.message).toContain('未注册');
    expect(calls).toHaveLength(0);
  });

  it('触发挂点不匹配：拒绝且不进执行端口', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({ execution: recordingPort(calls) });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.close', {});

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('chapter.open');
    expect(calls).toHaveLength(0);
  });

  it('能力越权：运行期回查拒绝，不进执行端口', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({
      script: { ...SCRIPT, capabilities: ['read:secret'] },
      permissions: { write: ['cards'] },
      execution: recordingPort(calls),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
    expect(result.error?.message).toContain('read:secret');
    expect(calls).toHaveLength(0);
  });

  it('超时中断：透传沙箱结构化错误', async () => {
    const host = makeHost({
      execution: () => Promise.resolve({ ok: false, error: { kind: 'timeout', message: '执行超时，已中断' } }),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('timeout');
    expect(result.error?.message).toContain('超时');
  });

  it('输出超限：透传沙箱 limit 错误', async () => {
    const host = makeHost({
      execution: () => Promise.resolve({ ok: false, error: { kind: 'limit', message: '输出超上限 262144' } }),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('limit');
  });

  it('非法输出：按 output schema 拒绝', async () => {
    const host = makeHost({
      execution: () => Promise.resolve({ ok: true, output: 123 }),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('schema');
    expect(result.error?.message).toContain('output');
  });

  it('非法输入：按 input schema 拒绝，不进执行端口', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({
      script: { ...SCRIPT, input: { type: 'object' } },
      execution: recordingPort(calls),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', 'not-an-object');

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('schema');
    expect(result.error?.message).toContain('input');
    expect(calls).toHaveLength(0);
  });

  it('入口缺失：拒绝为 not-found', async () => {
    const host = makeHost({
      script: { ...SCRIPT, entry: 'scripts/missing.js' },
      execution: () => Promise.resolve({ ok: true, output: 'hello' }),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('not-found');
    expect(result.error?.message).toContain('scripts/missing.js');
  });

  it('未配置执行端口：拒绝（fail-closed）', async () => {
    const host = makeHost();
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
    expect(result.error?.message).toContain('执行端口');
  });

  it('禁用后：拒绝且不进执行端口', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({ execution: recordingPort(calls) });
    host.activate(PLUGIN_ID);
    host.disable(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
    expect(calls).toHaveLength(0);
  });
});

describe('PluginHost.runScript 能力通道与 tool:propose', () => {
  const PROPOSAL_SCRIPT: ScriptDescriptor = {
    ...SCRIPT,
    capabilities: ['write:cards', 'tool:propose'],
  };

  function proposalPort(call: { tool: string; args: unknown }): ScriptExecutionPort {
    return () =>
      Promise.resolve<SandboxRunResult>({
        ok: true,
        output: { output: 'done', toolCalls: [call] },
      });
  }

  function recordingProposal(sink: ToolProposalRequest[], result?: { ok: boolean; error?: { kind: 'capability'; message: string } }): ToolProposalPort {
    return (request) => {
      sink.push(request);
      return Promise.resolve(result ? { ...result } : { ok: true, accepted: request.proposals.length });
    };
  }

  it('放行：能力白名单入请求，能力映射交端口，工具提议走审批端口', async () => {
    const calls: SandboxRunRequest[] = [];
    const routed: ToolProposalRequest[] = [];
    const host = makeHost({
      script: PROPOSAL_SCRIPT,
      permissions: { write: ['cards'] },
      execution: (request) => {
        calls.push(request);
        return Promise.resolve<SandboxRunResult>({
          ok: true,
          output: { output: 'done', toolCalls: [{ tool: 'write:cards', args: { x: 1 } }] },
        });
      },
      toolProposal: recordingProposal(routed),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(true);
    expect(result.output).toBe('done');
    expect(result.toolCalls).toHaveLength(1);
    // 端口只见到已声明且过权限回查的能力，未声明能力不可见
    expect(calls[0]?.capabilities).toEqual(['write:cards', 'tool:propose']);
    expect(calls[0]?.allowedTools).toEqual(['write:cards']);
    // 提议经审批管线端口，附能力映射
    expect(routed).toHaveLength(1);
    expect(routed[0]?.capabilities).toEqual({ read: [], write: ['cards'], net: false, ai: false, toolPropose: true });
    expect(routed[0]?.proposals).toEqual([{ tool: 'write:cards', args: { x: 1 } }]);
  });

  it('越权能力：运行期回查拒绝，不进执行端口', async () => {
    const calls: SandboxRunRequest[] = [];
    const host = makeHost({
      script: { ...SCRIPT, capabilities: ['read:secret'] },
      permissions: { write: ['cards'] },
      execution: (request) => {
        calls.push(request);
        return Promise.resolve({ ok: true, output: 'done' });
      },
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
    expect(result.error?.message).toContain('read:secret');
    expect(calls).toHaveLength(0);
  });

  it('未声明能力不可见：工具调用被白名单裁决拒绝，不进审批端口', async () => {
    const routed: ToolProposalRequest[] = [];
    const host = makeHost({
      script: { ...SCRIPT, capabilities: undefined },
      execution: proposalPort({ tool: 'write:cards', args: {} }),
      toolProposal: recordingProposal(routed),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('capability');
    expect(result.error?.message).toContain('未授权工具调用');
    expect(routed).toHaveLength(0);
  });

  it('未声明 tool:propose：即使白名单命中也不受理提议', async () => {
    const routed: ToolProposalRequest[] = [];
    const host = makeHost({
      script: { ...SCRIPT, capabilities: ['write:cards'] },
      permissions: { write: ['cards'] },
      execution: proposalPort({ tool: 'write:cards', args: {} }),
      toolProposal: recordingProposal(routed),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('capability');
    expect(result.error?.message).toContain('tool:propose');
    expect(routed).toHaveLength(0);
  });

  it('审批管线拒绝提议：结果失败，无直接写路径', async () => {
    const routed: ToolProposalRequest[] = [];
    const host = makeHost({
      script: PROPOSAL_SCRIPT,
      permissions: { write: ['cards'] },
      execution: proposalPort({ tool: 'write:cards', args: {} }),
      toolProposal: recordingProposal(routed, { ok: false, error: { kind: 'capability', message: '用户拒绝' } }),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('用户拒绝');
    expect(routed).toHaveLength(1);
  });

  it('声明 tool:propose 但未配置审批端口：拒绝（fail-closed）', async () => {
    const host = makeHost({
      script: PROPOSAL_SCRIPT,
      permissions: { write: ['cards'] },
      execution: proposalPort({ tool: 'write:cards', args: {} }),
    });
    host.activate(PLUGIN_ID);

    const result = await host.runScript(PLUGIN_ID, REGISTERED_ID, 'chapter.open', {});

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
    expect(result.error?.message).toContain('工具提议端口');
  });
});
