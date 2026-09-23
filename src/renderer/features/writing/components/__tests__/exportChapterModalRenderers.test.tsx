// @vitest-environment jsdom
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
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setAssistantRuntime } from '@/shared/services/assistantRuntime';
import { setBuildRendererHost } from '@/shared/services/buildRendererPort';

import type { Project } from '../../../../../shared/types';
import { buildExportContent, buildQuickExportProfile, setSelectedExportRenderer } from '../../utils';
import ExportChapterModal from '../ExportChapterModal';

const PLUGIN_ID = 'com.example.rtfx';

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
  setBuildRendererHost(host);
  setAssistantRuntime({
    pluginHostPromise: Promise.resolve(host),
    reloadPlugins: async () => host,
    saveDisabledList: () => undefined,
    listUserSkills: async () => [],
    listBuiltinSkills: () => [],
    importUserSkill: async () => ({ ok: true }),
    deleteUserSkill: async () => undefined,
  });
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

function renderModal(onFormatChange = vi.fn()) {
  render(
    <ExportChapterModal
      isOpen
      project={project}
      chapters={project.chapters}
      selectedChapterIds={new Set(['c1'])}
      format="txt"
      exportProfileId=""
      onExportProfileChange={vi.fn()}
      exportProfile={buildQuickExportProfile('txt')}
      exportCompile={{
        materialPolicy: 'exclude',
        tocEnabled: false,
        tocDepth: 1,
        headingLevel: 2,
        rangeFrom: null,
        rangeTo: null,
        volumeIds: [],
        volumeTypes: [],
        frontMatterIds: [],
        backMatterIds: [],
      }}
      onExportCompileChange={vi.fn()}
      exportUserProfiles={[]}
      onSaveExportProfile={vi.fn()}
      onDeleteExportProfile={vi.fn()}
      exportError={null}
      onClose={vi.fn()}
      onToggleAll={vi.fn()}
      onToggleChapter={vi.fn()}
      onFormatChange={onFormatChange}
      onConfirm={vi.fn()}
    />,
  );
  return { onFormatChange };
}

afterEach(() => {
  cleanup();
  setBuildRendererHost(null);
  setSelectedExportRenderer(null);
});

describe('ExportChapterModal 插件渲染器格式条', () => {
  it('宿主就绪后在内置格式之后列出已注册渲染器', async () => {
    makeHost(true);
    renderModal();

    // 内置 8 格式仍在。
    expect(screen.getByTitle('导出为 TXT 格式')).toBeTruthy();
    // 插件渲染器芯片可用，提示带渲染器 id 与目标格式。
    const chip = await waitFor(() => screen.getByRole('button', { name: /rtfx\.renderer\.rtf（rtf）/ }));
    expect((chip as HTMLButtonElement).disabled).toBe(false);
  });

  it('插件未激活：渲染器芯片置灰并说明原因', async () => {
    makeHost(false);
    renderModal();

    const chip = await waitFor(() => screen.getByRole('button', { name: /rtfx\.renderer\.rtf/ }));
    expect((chip as HTMLButtonElement).disabled).toBe(true);
    expect(chip.getAttribute('title')).toContain(PLUGIN_ID);
    // 格式条下方给出汇总说明，不依赖悬停。
    expect(screen.getByText(/插件渲染器暂不可用/)).toBeTruthy();
  });

  it('选中插件渲染器：切到目标格式并写入显式渲染器（落盘走插件产出）', async () => {
    makeHost(true);
    const { onFormatChange } = renderModal();

    const chip = await waitFor(() => screen.getByRole('button', { name: /rtfx\.renderer\.rtf（rtf）/ }));
    await act(async () => {
      chip.click();
    });
    expect(onFormatChange).toHaveBeenCalledWith('rtf');

    // 对话框的选择经 utils seam 生效：随后落盘用插件渲染器而不是内置 RTF。
    const text = buildExportContent(project, new Set(['c1']), 'rtf', buildQuickExportProfile('rtf'));
    expect(text).toContain('插件渲染器产出');
    expect(text).not.toContain('rtf1');
  });
});
