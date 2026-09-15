/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 构建管线插件渲染器端口装配（docs/design/49：沙箱执行·渲染器面）。
 *
 * 宿主内已注入的 `RendererExecutionPort`（渲染进程同步执行）经 `PluginHost.runRenderer`
 * 的门序适配为 `core/build` 的 `PluginRendererPort`：只读列出已注册渲染器，渲染时经宿主
 * 门控（激活、注册、纯同步、能力回查、入口与 schema）后同步执行。宿主未装配即无端口，
 * 构建管线回落内置渲染器（缺省零回归）。
 */
import type { PluginRendererPort, PluginRendererResult } from '@core/build';
import type { PluginHost } from '@core/plugin';

/** 当前装配的宿主；未装配时为 null（构建管线只用内置渲染器）。 */
let rendererHost: PluginHost | null = null;

/** 装配处（bootstrapPlugins）登记当前宿主；传 null 即解除。 */
export function setBuildRendererHost(host: PluginHost | null): void {
  rendererHost = host;
}

/** 构建管线注入端口；未装配宿主时返回 undefined（只用内置渲染器）。 */
export function getBuildRendererPort(): PluginRendererPort | undefined {
  const host = rendererHost;
  if (!host) return undefined;
  return {
    list: () =>
      host.rendererDescriptors().map((registered) => ({
        id: registered.id,
        format: registered.descriptor.format,
        pluginId: registered.pluginId,
      })),
    render: (request): PluginRendererResult => {
      const result = host.runRenderer(request.pluginId, request.rendererId, {
        blocks: request.blocks,
        profile: request.profile,
      });
      if (result.ok && typeof result.text === 'string') return { ok: true, text: result.text };
      return {
        ok: false,
        error: { kind: result.error?.kind ?? 'runtime', message: result.error?.message ?? '渲染器执行失败' },
      };
    },
  };
}
