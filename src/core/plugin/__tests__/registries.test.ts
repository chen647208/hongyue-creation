/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect, it } from 'vitest';

import type { RendererDescriptor, ScriptDescriptor } from '../descriptors.js';
import type { PluginManifest } from '../manifest.js';
import {
  type ExecutableContributionSource,
  installExecutableDescriptors,
  RendererRegistry,
  ScriptRegistry,
} from '../registries.js';

function manifest(contributes?: PluginManifest['contributes']): PluginManifest {
  return {
    id: 'com.example.plugin',
    name: 'plugin',
    version: '1.0.0',
    host: '^2.0.0',
    license: 'MIT',
    permissions: { read: ['manuscript'], write: ['cards'], network: true, ai: { quotaPerHour: 5 } },
    contributes,
  };
}

const RENDERER: RendererDescriptor = {
  id: 'rtf',
  entry: 'renderers/rtf.js',
  export: 'renderRtf',
  purity: 'pure',
  mode: 'sync',
  format: 'rtf',
};

const SCRIPT: ScriptDescriptor = {
  id: 'on-open',
  entry: 'scripts/open.js',
  export: 'onOpen',
  purity: 'effectful',
  mode: 'async',
  on: 'chapter.open',
  capabilities: ['write:cards'],
};

function source(contributes: PluginManifest['contributes'], files: Record<string, string>): ExecutableContributionSource {
  return { manifest: manifest(contributes), files };
}

describe('ExecutableRegistry 生命周期', () => {
  it('注册、查询、列举与释放', () => {
    const registry = new RendererRegistry();
    const disposable = registry.register('com.example.plugin', RENDERER);
    expect(registry.get('plugin.renderer.rtf')?.descriptor.format).toBe('rtf');
    expect(registry.list()).toHaveLength(1);
    expect(registry.listByPlugin('com.example.plugin')).toHaveLength(1);
    disposable.dispose();
    expect(registry.get('plugin.renderer.rtf')).toBeUndefined();
    expect(registry.size()).toBe(0);
  });

  it('重复注册同一命名空间 id 拒绝', () => {
    const registry = new ScriptRegistry();
    registry.register('com.example.plugin', SCRIPT);
    expect(() => registry.register('com.example.plugin', SCRIPT)).toThrow('重复注册');
  });

  it('命名空间隔离：不同插件的同名描述符共存', () => {
    const registry = new RendererRegistry();
    registry.register('com.a.alpha', RENDERER);
    registry.register('com.b.beta', RENDERER);
    expect(registry.size()).toBe(2);
    expect(registry.get('alpha.renderer.rtf')?.pluginId).toBe('com.a.alpha');
    expect(registry.get('beta.renderer.rtf')?.pluginId).toBe('com.b.beta');
  });

  it('过期句柄释放不误删后续替换项', () => {
    const registry = new RendererRegistry();
    const first = registry.register('com.example.plugin', RENDERER);
    first.dispose();
    registry.register('com.example.plugin', RENDERER);
    first.dispose();
    expect(registry.get('plugin.renderer.rtf')).toBeDefined();
  });
});

describe('installExecutableDescriptors', () => {
  it('无 renderers/scripts 声明直接放行且不注册', () => {
    const renderers = new RendererRegistry();
    const scripts = new ScriptRegistry();
    const result = installExecutableDescriptors(source(undefined, {}), renderers, scripts, { signed: true });
    expect(result.ok).toBe(true);
    expect(result.disposables).toHaveLength(0);
    expect(renderers.size()).toBe(0);
  });

  it('未签名：拒绝注册且无残留', () => {
    const renderers = new RendererRegistry();
    const scripts = new ScriptRegistry();
    const result = installExecutableDescriptors(
      source({ renderers: ['./renderers/'] }, { 'renderers/renderers.json': JSON.stringify([RENDERER]) }),
      renderers,
      scripts,
      { signed: false },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('签名');
    expect(renderers.size()).toBe(0);
  });

  it('已签名：注册渲染器与脚本，Disposable 逆序回滚', () => {
    const renderers = new RendererRegistry();
    const scripts = new ScriptRegistry();
    const result = installExecutableDescriptors(
      source(
        { renderers: ['./renderers/'], scripts: ['./scripts/'] },
        {
          'renderers/renderers.json': JSON.stringify([RENDERER]),
          'scripts/scripts.json': JSON.stringify([SCRIPT]),
        },
      ),
      renderers,
      scripts,
      { signed: true },
    );
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(renderers.get('plugin.renderer.rtf')).toBeDefined();
    expect(scripts.get('plugin.script.on-open')).toBeDefined();
    expect(result.disposables).toHaveLength(2);
    for (const disposable of result.disposables) disposable.dispose();
    expect(renderers.size()).toBe(0);
    expect(scripts.size()).toBe(0);
  });

  it('越权能力：整体拒绝，无部分注册', () => {
    const renderers = new RendererRegistry();
    const scripts = new ScriptRegistry();
    const overreach = { ...RENDERER, capabilities: ['read:secret'] };
    const result = installExecutableDescriptors(
      source({ renderers: ['./renderers/'] }, { 'renderers/renderers.json': JSON.stringify([overreach]) }),
      renderers,
      scripts,
      { signed: true },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('read:secret');
    expect(renderers.size()).toBe(0);
  });

  it('入口不在声明贡献目录内：拒绝', () => {
    const renderers = new RendererRegistry();
    const scripts = new ScriptRegistry();
    const outside = { ...RENDERER, entry: 'logic/rtf.js' };
    const result = installExecutableDescriptors(
      source({ renderers: ['./renderers/'] }, { 'renderers/renderers.json': JSON.stringify([outside]) }),
      renderers,
      scripts,
      { signed: true },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('不在贡献目录');
    expect(renderers.size()).toBe(0);
  });

  it('描述符 JSON 非法或非数组：拒绝', () => {
    const renderers = new RendererRegistry();
    const scripts = new ScriptRegistry();
    const broken = installExecutableDescriptors(
      source({ renderers: ['./renderers/'] }, { 'renderers/renderers.json': 'not-json' }),
      renderers,
      scripts,
      { signed: true },
    );
    expect(broken.ok).toBe(false);
    const notArray = installExecutableDescriptors(
      source({ renderers: ['./renderers/'] }, { 'renderers/renderers.json': JSON.stringify(RENDERER) }),
      renderers,
      scripts,
      { signed: true },
    );
    expect(notArray.ok).toBe(false);
  });
});
