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
  parseHostCapability,
  rendererId,
  scriptId,
  validateRendererDescriptor,
  validateScriptDescriptor,
} from '../descriptors.js';
import type { PluginManifest } from '../manifest.js';

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'com.example.plugin',
    name: 'plugin',
    version: '1.0.0',
    host: '^2.0.0',
    license: 'MIT',
    permissions: { read: ['manuscript'], write: ['cards'], network: true, ai: { quotaPerHour: 5 } },
    ...overrides,
  };
}

const RENDERER = {
  id: 'rtf',
  entry: './logic/rtf.js',
  export: 'renderRtf',
  purity: 'pure',
  mode: 'sync',
  format: 'rtf',
};

const SCRIPT = {
  id: 'on-open',
  entry: './scripts/open.js',
  export: 'onOpen',
  purity: 'effectful',
  mode: 'async',
  on: 'chapter.open',
};

describe('validateRendererDescriptor', () => {
  it('接受纯函数 + 同步的合法描述符并规范化入口路径', () => {
    const result = validateRendererDescriptor(RENDERER, manifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.descriptor.entry).toBe('logic/rtf.js');
      expect(result.descriptor.format).toBe('rtf');
    }
  });

  it('拒绝副作用渲染器与异步渲染器', () => {
    const effectful = validateRendererDescriptor({ ...RENDERER, purity: 'effectful' }, manifest());
    expect(effectful.ok).toBe(false);
    if (!effectful.ok) expect(effectful.issues.some((i) => i.path === 'purity')).toBe(true);

    const async = validateRendererDescriptor({ ...RENDERER, mode: 'async' }, manifest());
    expect(async.ok).toBe(false);
    if (!async.ok) expect(async.issues.some((i) => i.path === 'mode')).toBe(true);
  });

  it('拒绝缺失导出格式', () => {
    const result = validateRendererDescriptor({ ...RENDERER, format: '' }, manifest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.path === 'format')).toBe(true);
  });

  it('拒绝越界入口路径（.. / 绝对路径 / 盘符）', () => {
    for (const entry of ['../evil.js', '/etc/passwd', 'C:\\evil.js']) {
      const result = validateRendererDescriptor({ ...RENDERER, entry }, manifest());
      expect(result.ok, entry).toBe(false);
    }
  });

  it('拒绝非法导出名', () => {
    for (const exportName of ['1bad', 'foo bar', '']) {
      const result = validateRendererDescriptor({ ...RENDERER, export: exportName }, manifest());
      expect(result.ok, exportName).toBe(false);
    }
  });

  it('input/output 必须是 JSON Schema 对象', () => {
    const badInput = validateRendererDescriptor({ ...RENDERER, input: ['x'] }, manifest());
    expect(badInput.ok).toBe(false);
    const badType = validateRendererDescriptor({ ...RENDERER, output: { type: 1 } }, manifest());
    expect(badType.ok).toBe(false);
    const good = validateRendererDescriptor({ ...RENDERER, input: { type: 'object' } }, manifest());
    expect(good.ok).toBe(true);
  });
});

describe('能力白名单与权限回查', () => {
  it('已声明权限的能力放行', () => {
    const result = validateRendererDescriptor(
      { ...RENDERER, capabilities: ['read:manuscript', 'write:cards', 'net', 'ai', 'tool:propose'] },
      manifest(),
    );
    expect(result.ok).toBe(true);
  });

  it('未在 permissions 声明的数据域拒绝', () => {
    const read = validateRendererDescriptor({ ...RENDERER, capabilities: ['read:index'] }, manifest());
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.issues.some((i) => i.path === 'capabilities[0]')).toBe(true);

    const write = validateRendererDescriptor({ ...RENDERER, capabilities: ['write:manuscript'] }, manifest());
    expect(write.ok).toBe(false);
  });

  it('net/ai 能力与 manifest 权限绑定', () => {
    const noNet = validateRendererDescriptor(
      { ...RENDERER, capabilities: ['net'] },
      manifest({ permissions: {} }),
    );
    expect(noNet.ok).toBe(false);
    const noAi = validateRendererDescriptor(
      { ...RENDERER, capabilities: ['ai'] },
      manifest({ permissions: {} }),
    );
    expect(noAi.ok).toBe(false);
  });

  it('未知能力一律拒绝（禁直连 fs/net/eval）', () => {
    for (const capability of ['eval', 'fetch', 'fs:/etc', 'unknown:x']) {
      const result = validateRendererDescriptor({ ...RENDERER, capabilities: [capability] }, manifest());
      expect(result.ok, capability).toBe(false);
    }
  });

  it('parseHostCapability 只接受白名单前缀', () => {
    expect(parseHostCapability('tool:propose', manifest()).ok).toBe(true);
    expect(parseHostCapability('tool:run', manifest()).ok).toBe(false);
    expect(parseHostCapability('read:manuscript', manifest()).ok).toBe(true);
    expect(parseHostCapability('read', manifest()).ok).toBe(false);
  });
});

describe('validateScriptDescriptor', () => {
  it('接受副作用 + 异步脚本', () => {
    const result = validateScriptDescriptor(SCRIPT, manifest());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.descriptor.on).toBe('chapter.open');
  });

  it('拒绝缺失触发挂点', () => {
    const result = validateScriptDescriptor({ ...SCRIPT, on: '' }, manifest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.path === 'on')).toBe(true);
  });
});

describe('命名空间 id', () => {
  it('渲染器与脚本各自前缀隔离', () => {
    expect(rendererId('com.example.plugin', 'rtf')).toBe('plugin.renderer.rtf');
    expect(scriptId('com.example.plugin', 'on-open')).toBe('plugin.script.on-open');
  });
});
