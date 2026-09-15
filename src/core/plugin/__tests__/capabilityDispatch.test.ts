/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import {
  type CapabilityAuthorizeRequest,
  type CapabilityDispatchAdapters,
  createCapabilityDispatchPort,
  isCapabilityDeclared,
  parseCapabilityTool,
} from '../capabilityDispatch.js';
import type { CapabilityMap, ToolProposalRequest } from '../execution.js';
import type { SandboxToolCall } from '../sandbox/types.js';

function map(partial: Partial<CapabilityMap> = {}): CapabilityMap {
  return { read: [], write: [], net: false, ai: false, toolPropose: true, ...partial };
}

function request(proposals: SandboxToolCall[], capabilities: CapabilityMap): ToolProposalRequest {
  return { pluginId: 'com.example.plugin', scriptId: 'plugin.script.on-open', capabilities, proposals };
}

interface Recorder {
  adapters: CapabilityDispatchAdapters;
  authorized: CapabilityAuthorizeRequest[];
  executed: SandboxToolCall[];
  fenced: string[];
}

function recorder(overrides: Partial<CapabilityDispatchAdapters> = {}): Recorder {
  const authorized: CapabilityAuthorizeRequest[] = [];
  const executed: SandboxToolCall[] = [];
  const fenced: string[] = [];
  const adapters: CapabilityDispatchAdapters = {
    authorize: async (_permission, req) => {
      authorized.push(req);
      return { allowed: true };
    },
    execute: async (call) => {
      executed.push(call);
      return { ok: true, text: `result:${call.tool}` };
    },
    fence: (text, origin) => {
      fenced.push(origin);
      return `<<<UNTRUSTED>>>${text}`;
    },
    ...overrides,
  };
  return { adapters, authorized, executed, fenced };
}

describe('parseCapabilityTool / isCapabilityDeclared', () => {
  it('解析读写/网络/AI 能力，其余为 unknown', () => {
    expect(parseCapabilityTool('read:cards')).toEqual({ kind: 'read', domain: 'cards' });
    expect(parseCapabilityTool('write:cards')).toEqual({ kind: 'write', domain: 'cards' });
    expect(parseCapabilityTool('net')).toEqual({ kind: 'net' });
    expect(parseCapabilityTool('ai')).toEqual({ kind: 'ai' });
    expect(parseCapabilityTool('eval')).toEqual({ kind: 'unknown' });
    expect(parseCapabilityTool('read:')).toEqual({ kind: 'unknown' });
    expect(parseCapabilityTool('fetch:https://x')).toEqual({ kind: 'unknown' });
  });

  it('白名单交叉回查：未声明的域不可见', () => {
    const capabilities = map({ read: ['cards'], write: ['cards'] });
    expect(isCapabilityDeclared({ kind: 'read', domain: 'cards' }, capabilities)).toBe(true);
    expect(isCapabilityDeclared({ kind: 'read', domain: 'secret' }, capabilities)).toBe(false);
    expect(isCapabilityDeclared({ kind: 'write', domain: 'cards' }, capabilities)).toBe(true);
    expect(isCapabilityDeclared({ kind: 'write', domain: 'secret' }, capabilities)).toBe(false);
    expect(isCapabilityDeclared({ kind: 'net' }, capabilities)).toBe(false);
    expect(isCapabilityDeclared({ kind: 'ai' }, capabilities)).toBe(false);
    expect(isCapabilityDeclared({ kind: 'unknown' }, capabilities)).toBe(false);
  });
});

describe('createCapabilityDispatchPort 白名单派发', () => {
  it('read：直通执行，不围栏', async () => {
    const r = recorder();
    const port = createCapabilityDispatchPort(r.adapters);

    const result = await port(request([{ tool: 'read:cards', args: { query: 'x' } }], map({ read: ['cards'] })));

    expect(result.ok).toBe(true);
    expect(result.accepted).toBe(1);
    expect(result.results).toEqual([{ tool: 'read:cards', text: 'result:read:cards' }]);
    expect(r.executed).toHaveLength(1);
    expect(r.authorized[0]?.proposal).toBeUndefined();
    expect(r.fenced).toEqual([]);
  });

  it('write：带提案走审批，批后执行', async () => {
    const r = recorder();
    const port = createCapabilityDispatchPort(r.adapters);

    const result = await port(
      request([{ tool: 'write:cards', args: { title: '新反派', body: '正文' } }], map({ write: ['cards'] })),
    );

    expect(result.ok).toBe(true);
    expect(result.results?.[0]?.tool).toBe('write:cards');
    expect(r.authorized[0]?.proposal).toEqual({ title: '新反派', summary: '插件提议调用 write:cards', suggestion: '正文' });
  });

  it('write：用户拒绝则不执行', async () => {
    const r = recorder({ authorize: async () => ({ allowed: false, reason: '用户拒绝该提议' }) });
    const port = createCapabilityDispatchPort(r.adapters);

    const result = await port(request([{ tool: 'write:cards', args: { body: 'x' } }], map({ write: ['cards'] })));

    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('capability');
    expect(result.error?.message).toContain('用户拒绝');
    expect(r.executed).toHaveLength(0);
  });

  it('越权工具：白名单外直接拒绝，不触审批与执行', async () => {
    const r = recorder();
    const port = createCapabilityDispatchPort(r.adapters);

    const result = await port(request([{ tool: 'read:secret', args: {} }], map({ read: ['cards'] })));

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('未在描述符能力白名单');
    expect(r.authorized).toHaveLength(0);
    expect(r.executed).toHaveLength(0);
  });

  it('net/ai：结果经不可信围栏', async () => {
    const r = recorder();
    const port = createCapabilityDispatchPort(r.adapters);

    const result = await port(
      request([{ tool: 'net', args: { url: 'https://example.com' } }, { tool: 'ai', args: { prompt: 'hi' } }], map({ net: true, ai: true })),
    );

    expect(result.accepted).toBe(2);
    expect(result.results?.map((x) => x.text)).toEqual(['<<<UNTRUSTED>>>result:net', '<<<UNTRUSTED>>>result:ai']);
    expect(r.fenced).toEqual(['plugin:com.example.plugin/net', 'plugin:com.example.plugin/ai']);
  });

  it('执行失败：整体失败并带原因', async () => {
    const r = recorder({ execute: async () => ({ ok: false, reason: '仓库不可用' }) });
    const port = createCapabilityDispatchPort(r.adapters);

    const result = await port(request([{ tool: 'read:cards', args: {} }], map({ read: ['cards'] })));

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('仓库不可用');
  });

  it('未知能力：拒绝', async () => {
    const r = recorder();
    const port = createCapabilityDispatchPort(r.adapters);
    const result = await port(request([{ tool: 'fs:/etc/passwd', args: {} }], map({ read: ['cards'] })));
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('未在描述符能力白名单');
  });

  it('空提议：成功且零受理', async () => {
    const r = recorder();
    const port = createCapabilityDispatchPort(r.adapters);
    const result = await port(request([], map({ read: ['cards'] })));
    expect(result).toEqual({ ok: true, accepted: 0, results: [] });
  });
});
