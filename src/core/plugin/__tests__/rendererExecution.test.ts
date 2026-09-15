/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import type { RendererDescriptor } from '../descriptors.js';
import type { RendererExecutionPort, RendererRunRequest } from '../execution.js';
import type { PluginManifest, PluginPermissions } from '../manifest.js';
import { RendererRegistry } from '../registries.js';
import { PluginHost } from '../runtime.js';

const PLUGIN_ID = 'com.example.plugin';
const REGISTERED_ID = 'plugin.renderer.rtf';

const RENDERER: RendererDescriptor = {
  id: 'rtf',
  entry: 'renderers/rtf.js',
  export: 'renderRtf',
  purity: 'pure',
  mode: 'sync',
  format: 'rtf',
  output: { type: 'string' },
};

function manifest(permissions: PluginPermissions = {}): PluginManifest {
  return {
    id: PLUGIN_ID,
    name: 'plugin',
    version: '1.0.0',
    host: '^2.0.0',
    license: 'MIT',
    permissions,
    contributes: { renderers: ['./renderers/'] },
  };
}

interface HostOptions {
  permissions?: PluginPermissions;
  renderer?: RendererDescriptor;
  execution?: RendererExecutionPort;
}

function makeHost(options: HostOptions = {}): PluginHost {
  const renderers = new RendererRegistry();
  renderers.register(PLUGIN_ID, options.renderer ?? RENDERER);
  const host = new PluginHost(
    { hostVersion: '2.0.0', renderers, rendererExecution: options.execution },
    () => [],
  );
  host.loadRaw(
    PLUGIN_ID,
    manifest(options.permissions),
    { 'renderers/rtf.js': 'export function renderRtf() { return "text"; }' },
    true,
  );
  return host;
}

interface StubPort {
  port: RendererExecutionPort;
  preheatCalls: string[];
  requests: RendererRunRequest[];
}

function stubPort(text: string): StubPort {
  const preheatCalls: string[] = [];
  const requests: RendererRunRequest[] = [];
  const port: RendererExecutionPort = {
    preheat: (_pluginId, entry) => {
      preheatCalls.push(entry);
    },
    render: (request) => {
      requests.push(request);
      return { ok: true, text };
    },
  };
  return { port, preheatCalls, requests };
}

describe('PluginHost.runRenderer 同步执行门控', () => {
  it('已激活：预热一次并同步产出文本', () => {
    const { port, preheatCalls, requests } = stubPort('hello');
    const host = makeHost({ execution: port });
    host.activate(PLUGIN_ID);

    const first = host.runRenderer(PLUGIN_ID, REGISTERED_ID, { value: 1 });
    const second = host.runRenderer(PLUGIN_ID, REGISTERED_ID, { value: 2 });

    expect(first.ok).toBe(true);
    expect(first.text).toBe('hello');
    expect(second.ok).toBe(true);
    expect(preheatCalls).toEqual(['renderers/rtf.js']);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.export).toBe('renderRtf');
    expect(requests[0]?.input).toEqual({ value: 1 });
  });

  it('接受插件内局部渲染器 id', () => {
    const { port } = stubPort('x');
    const host = makeHost({ execution: port });
    host.activate(PLUGIN_ID);
    expect(host.runRenderer(PLUGIN_ID, 'rtf').ok).toBe(true);
  });

  it('未激活：拒绝且不调用端口', () => {
    const { port, requests } = stubPort('x');
    const host = makeHost({ execution: port });
    const result = host.runRenderer(PLUGIN_ID, REGISTERED_ID);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
    expect(result.error?.message).toContain('未激活');
    expect(requests).toHaveLength(0);
  });

  it('未注册渲染器：拒绝', () => {
    const host = makeHost({ execution: stubPort('x').port });
    host.activate(PLUGIN_ID);
    expect(host.runRenderer(PLUGIN_ID, 'missing').ok).toBe(false);
  });

  it('禁用后：拒绝且不调用端口', () => {
    const { port, requests } = stubPort('x');
    const host = makeHost({ execution: port });
    host.activate(PLUGIN_ID);
    host.disable(PLUGIN_ID);
    const result = host.runRenderer(PLUGIN_ID, REGISTERED_ID);
    expect(result.ok).toBe(false);
    expect(requests).toHaveLength(0);
  });

  it('非纯同步描述符：拒绝', () => {
    const host = makeHost({
      renderer: { ...RENDERER, purity: 'effectful' } as unknown as RendererDescriptor,
      execution: stubPort('x').port,
    });
    host.activate(PLUGIN_ID);
    const result = host.runRenderer(PLUGIN_ID, REGISTERED_ID);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('pure');
  });

  it('能力越权：运行期回查拒绝，不调用端口', () => {
    const { port, requests } = stubPort('x');
    const host = makeHost({
      renderer: { ...RENDERER, capabilities: ['read:secret'] },
      permissions: {},
      execution: port,
    });
    host.activate(PLUGIN_ID);
    const result = host.runRenderer(PLUGIN_ID, REGISTERED_ID);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('read:secret');
    expect(requests).toHaveLength(0);
  });

  it('入口缺失：拒绝为 not-found', () => {
    const host = makeHost({
      renderer: { ...RENDERER, entry: 'renderers/missing.js' },
      execution: stubPort('x').port,
    });
    host.activate(PLUGIN_ID);
    const result = host.runRenderer(PLUGIN_ID, REGISTERED_ID);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('not-found');
  });

  it('输入 schema 不符：拒绝', () => {
    const { port, requests } = stubPort('x');
    const host = makeHost({ renderer: { ...RENDERER, input: { type: 'object' } }, execution: port });
    host.activate(PLUGIN_ID);
    const result = host.runRenderer(PLUGIN_ID, REGISTERED_ID, 'not-an-object');
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('schema');
    expect(requests).toHaveLength(0);
  });

  it('输出非字符串：拒绝为 schema', () => {
    const host = makeHost({
      execution: {
        render: () => ({ ok: true, text: undefined }),
      },
    });
    host.activate(PLUGIN_ID);
    const result = host.runRenderer(PLUGIN_ID, REGISTERED_ID);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('schema');
  });

  it('端口返回错误：透传结构化错误', () => {
    const host = makeHost({
      execution: { render: () => ({ ok: false, error: { kind: 'timeout', message: '渲染超时，已中断' } }) },
    });
    host.activate(PLUGIN_ID);
    const result = host.runRenderer(PLUGIN_ID, REGISTERED_ID);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('timeout');
  });

  it('端口抛错：回落 runtime 错误，不冒泡', () => {
    const host = makeHost({
      execution: {
        render: () => {
          throw new Error('boom');
        },
      },
    });
    host.activate(PLUGIN_ID);
    const result = host.runRenderer(PLUGIN_ID, REGISTERED_ID);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.message).toContain('boom');
  });

  it('未配置同步端口：拒绝（fail-closed）', () => {
    const host = makeHost();
    host.activate(PLUGIN_ID);
    const result = host.runRenderer(PLUGIN_ID, REGISTERED_ID);
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe('permission');
    expect(result.error?.message).toContain('同步执行端口');
  });
});
