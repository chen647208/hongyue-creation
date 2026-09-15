/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件脚本事件触发点（design/49 沙箱执行）。
 *
 * 应用层在宿主事件处调用 `emitPluginEvent`；本模块只把事件转交当前活动宿主的
 * `PluginHost.emit`，不持有插件逻辑。宿主缺省、无脚本注册表或无订阅时零开销。
 * 事件名取自 `HOST_SCRIPT_EVENTS`，不另立第二套。
 */

import type { HostScriptEvent, PluginHost, ScriptEventPayload } from '@core/plugin';

let eventHost: PluginHost | null = null;

/** 绑定当前活动宿主（宿主装配处调用）；传 null 解绑。 */
export function bindPluginEventHost(host: PluginHost | null): void {
  eventHost = host;
}

/**
 * 是否存在订阅该事件的已激活脚本：无宿主、无订阅即 false。
 * 调用方据此在无插件时跳过事件载荷计算，保证缺省零开销。
 */
export function hasPluginScriptSubscribers(event: HostScriptEvent): boolean {
  return eventHost?.hasEventSubscribers(event) ?? false;
}

/** 触发宿主脚本事件：异步、非阻塞，单脚本失败由宿主记日志，不影响调用方主流程。 */
export function emitPluginEvent(event: HostScriptEvent, payload?: ScriptEventPayload): void {
  eventHost?.emit(event, payload);
}
