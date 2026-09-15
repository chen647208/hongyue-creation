/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { describe, expect,it } from 'vitest';

import type { AttributeEntity, EdgeEntity,NodeEntity } from '../../entities';
import {
  type BuildProfile,
  DEFAULT_BUILD_PROFILE,
  type PluginRendererInfo,
  type PluginRendererPort,
  type PluginRendererRequest,
  type PluginRendererResult,
  runBuild,
} from '../index.js';

function node(id: string, type: string, title: string, body: string): NodeEntity {
  return { id, bookId: 'b1', type, title, body, createdAt: 0, updatedAt: 0, erased: false } as NodeEntity;
}

function entities(): { nodes: NodeEntity[]; attrs: AttributeEntity[]; edges: EdgeEntity[] } {
  return {
    nodes: [
      node('ch1', 'novel.chapter', '第一章', '正文第一段。'),
      node('ch2', 'novel.chapter', '第二章', '第二章正文。'),
    ],
    attrs: [],
    edges: [],
  };
}

function port(
  infos: PluginRendererInfo[],
  render: (request: PluginRendererRequest) => PluginRendererResult = () => ({ ok: true, text: 'PLUGIN' }),
): PluginRendererPort {
  return { list: () => infos, render };
}

describe('插件渲染器端口（design/49 沙箱执行·渲染器面）', () => {
  it('显式选择插件渲染器即走插件，报告标明 id、来源与插件', () => {
    const profile: BuildProfile = { ...DEFAULT_BUILD_PROFILE, renderer: 'demo.renderer.md' };
    const built = runBuild(profile, entities(), {
      rendererPort: port([{ id: 'demo.renderer.md', format: 'md', pluginId: 'demo' }], () => ({ ok: true, text: '<plugin/>' })),
    });
    expect(built.text).toBe('<plugin/>');
    expect(built.report).toEqual({ renderer: 'demo.renderer.md', source: 'plugin', pluginId: 'demo' });
  });

  it('未注入端口时与内置逐字一致', () => {
    const plain = runBuild(DEFAULT_BUILD_PROFILE, entities());
    expect(plain.report).toEqual({ renderer: 'md', source: 'builtin' });

    const empty = runBuild(DEFAULT_BUILD_PROFILE, entities(), {});
    expect(empty.text).toBe(plain.text);
    expect(empty.report).toEqual(plain.report);

    const unmatched = runBuild(DEFAULT_BUILD_PROFILE, entities(), {
      rendererPort: port([{ id: 'demo.renderer.other', format: 'other', pluginId: 'demo' }]),
    });
    expect(unmatched.text).toBe(plain.text);
    expect(unmatched.report).toEqual(plain.report);
  });

  it('同格式存在内置渲染器且未显式指定时保持内置', () => {
    const plain = runBuild(DEFAULT_BUILD_PROFILE, entities());
    const built = runBuild(DEFAULT_BUILD_PROFILE, entities(), {
      rendererPort: port([{ id: 'demo.renderer.md', format: 'md', pluginId: 'demo' }], () => ({ ok: true, text: 'PLUGIN' })),
    });
    expect(built.text).toBe(plain.text);
    expect(built.report).toEqual({ renderer: 'md', source: 'builtin' });
  });

  it('内置缺失时格式命中唯一插件渲染器即走插件', () => {
    const profile: BuildProfile = { ...DEFAULT_BUILD_PROFILE, format: 'cart' };
    const built = runBuild(profile, entities(), {
      rendererPort: port([{ id: 'demo.renderer.cart', format: 'cart', pluginId: 'demo' }], () => ({ ok: true, text: 'CART' })),
    });
    expect(built.text).toBe('CART');
    expect(built.report).toEqual({ renderer: 'demo.renderer.cart', source: 'plugin', pluginId: 'demo' });
  });

  it('渲染器返回错误时抛出可读失败，不回落成空文件', () => {
    const profile: BuildProfile = { ...DEFAULT_BUILD_PROFILE, renderer: 'demo.renderer.md' };
    const options = {
      rendererPort: port([{ id: 'demo.renderer.md', format: 'md', pluginId: 'demo' }], () => ({
        ok: false,
        error: { kind: 'timeout', message: '渲染器执行超时，已中断' },
      })),
    };
    expect(() => runBuild(profile, entities(), options)).toThrow(
      /插件渲染器 demo\.renderer\.md 渲染失败（timeout）：渲染器执行超时/,
    );
  });

  it('显式选择未注册的插件渲染器即报错', () => {
    const profile: BuildProfile = { ...DEFAULT_BUILD_PROFILE, renderer: 'demo.renderer.missing' };
    expect(() => runBuild(profile, entities(), { rendererPort: port([]) })).toThrow(
      /未注册的插件渲染器: demo\.renderer\.missing/,
    );
  });

  it('多渲染器同名格式：显式选择优先，未指定且无内置即报错要求显式选择', () => {
    const infos: PluginRendererInfo[] = [
      { id: 'a.renderer.cart', format: 'cart', pluginId: 'a' },
      { id: 'b.renderer.cart', format: 'cart', pluginId: 'b' },
    ];
    const rendererPort = port(infos, (request) => ({ ok: true, text: request.rendererId }));

    const explicit: BuildProfile = { ...DEFAULT_BUILD_PROFILE, format: 'cart', renderer: 'b.renderer.cart' };
    expect(runBuild(explicit, entities(), { rendererPort }).text).toBe('b.renderer.cart');

    const viaOptions = runBuild(
      { ...DEFAULT_BUILD_PROFILE, format: 'cart' },
      entities(),
      { rendererPort, rendererId: 'a.renderer.cart' },
    );
    expect(viaOptions.text).toBe('a.renderer.cart');

    const ambiguous: BuildProfile = { ...DEFAULT_BUILD_PROFILE, format: 'cart' };
    expect(() => runBuild(ambiguous, entities(), { rendererPort })).toThrow(/对应多个插件渲染器/);
  });
});
