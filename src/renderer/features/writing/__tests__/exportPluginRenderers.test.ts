/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import type { PluginHost, RendererDescriptor, RendererExecutionPort } from '@core/plugin';
import { PluginHost as PluginHostClass, RendererRegistry } from '@core/plugin';
import { afterEach, describe, expect, it } from 'vitest';

import { setBuildRendererHost } from '@/shared/services/buildRendererPort';

import type { Project } from '../../../../shared/types';
import {
  buildExportContent,
  buildQuickExportProfile,
  listPluginRendererOptions,
  setSelectedExportRenderer,
} from '../utils';

const PLUGIN_ID = 'com.example.rtfx';
/** 命名空间化 id = `<插件短名>.renderer.<声明 id>`（见 @core/plugin 的 rendererId）。 */
const RENDERER_ID = 'rtfx.renderer.rtf';

const RENDERER: RendererDescriptor = {
  id: 'rtf',
  entry: 'renderers/rtf.js',
  export: 'renderRtf',
  purity: 'pure',
  mode: 'sync',
  format: 'rtf',
  output: { type: 'string' },
};

/** 构造装配了渲染器注册表的宿主；activated=false 模拟插件未激活。 */
function makeHost(activated: boolean): PluginHost {
  const renderers = new RendererRegistry();
  renderers.register(PLUGIN_ID, RENDERER);
  const execution: RendererExecutionPort = {
    render: () => ({ ok: true, text: '插件渲染器产出' }),
  };
  const host = new PluginHostClass({ hostVersion: '2.0.0', renderers, rendererExecution: execution }, () => []);
  host.loadRaw(
    PLUGIN_ID,
    {
      id: PLUGIN_ID,
      name: 'rtfx',
      version: '1.0.0',
      host: '^2.0.0',
      license: 'MIT',
      contributes: { renderers: ['./renderers/'] },
    },
    { 'renderers/rtf.js': 'export function renderRtf() { return "插件渲染器产出"; }' },
    true,
  );
  if (activated) host.activate(PLUGIN_ID);
  return host;
}

const project: Project = {
  id: 'b1',
  title: '测试书',
  inspiration: '',
  intro: '',
  characters: [],
  outline: '',
  chapters: [{ id: 'c1', title: '第一章', order: 0, content: '正文内容', summary: '' }],
  virtualChapters: [],
  knowledge: [],
  lastModified: 1,
};

afterEach(() => {
  setBuildRendererHost(null);
  setSelectedExportRenderer(null);
});

describe('listPluginRendererOptions', () => {
  it('宿主未装配时返回空清单（格式条只显示内置格式）', () => {
    setBuildRendererHost(null);
    expect(listPluginRendererOptions(null)).toEqual([]);
  });

  it('已注册且插件已激活：可用，无不可用原因', () => {
    setBuildRendererHost(makeHost(true));
    const options = listPluginRendererOptions(makeHost(true));
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ id: RENDERER_ID, format: 'rtf', pluginId: PLUGIN_ID, unavailableReason: null });
  });

  it('已注册但插件未激活：不可用并携带原因', () => {
    setBuildRendererHost(makeHost(false));
    const options = listPluginRendererOptions(makeHost(false));
    expect(options).toHaveLength(1);
    expect(options[0]?.unavailableReason).toContain(PLUGIN_ID);
  });
});

describe('buildExportContent 的显式插件渲染器', () => {
  it('对话框选中已注册渲染器：走 runBuild 的 rendererId，产出插件文本', () => {
    setBuildRendererHost(makeHost(true));
    setSelectedExportRenderer(RENDERER_ID);
    const text = buildExportContent(project, new Set(['c1']), 'rtf', buildQuickExportProfile('rtf'));
    expect(text).toContain('插件渲染器产出');
    expect(text).not.toContain('rtf1'); // 内置 RTF 渲染器的文档头，未出现即没用内置渲染器
  });

  it('未选中渲染器：回落内置渲染器', () => {
    setBuildRendererHost(makeHost(true));
    setSelectedExportRenderer(null);
    const text = buildExportContent(project, new Set(['c1']), 'rtf', buildQuickExportProfile('rtf'));
    expect(text).toContain('rtf1');
    expect(text).not.toContain('插件渲染器产出');
  });

  it('选中的渲染器已不在注册清单（插件停用/卸载）：忽略并回落内置', () => {
    setBuildRendererHost(makeHost(true));
    setSelectedExportRenderer('rtfx.renderer.removed');
    const text = buildExportContent(project, new Set(['c1']), 'rtf', buildQuickExportProfile('rtf'));
    expect(text).toContain('rtf1');
    expect(text).not.toContain('插件渲染器产出');
  });
});
