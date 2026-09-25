/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件受控网络门 IPC（docs/design/40 §4）。
 *
 * 策略（域名白名单/方法/上限）持久化在主进程；插件不持有 fetch，只能提交请求，
 * 由主进程按 `core/plugin/netGate` 裁决后代理。默认拒绝：未配置白名单即拒绝全部。
 * 与 AI 网关的 `ai:http` 相互独立：此门不注入任何凭据，仅放行白名单内的公开请求。
 */
import fs from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain } from 'electron';

import {
  DEFAULT_NETWORK_POLICY,
  effectiveLimits,
  evaluateNetworkRequest,
  type NetworkGatePolicy,
} from '../../core/plugin/netGate.js';
import { tMain } from '../ai/i18n.js';
import { IPC } from '../channels.js';
import { logger } from '../logger.js';

let cachedPolicy: NetworkGatePolicy | null = null;

function policyFile(): string {
  return path.join(app.getPath('userData'), 'plugin-net-policy.json');
}

function loadPolicy(): NetworkGatePolicy {
  if (cachedPolicy) return cachedPolicy;
  try {
    const raw = JSON.parse(fs.readFileSync(policyFile(), 'utf-8')) as Record<string, unknown>;
    const hosts = Array.isArray(raw.allowedHosts)
      ? raw.allowedHosts.filter((h): h is string => typeof h === 'string' && h.length > 0)
      : [];
    cachedPolicy = {
      allowedHosts: hosts,
      allowedMethods: DEFAULT_NETWORK_POLICY.allowedMethods,
      maxResponseBytes: DEFAULT_NETWORK_POLICY.maxResponseBytes,
      timeoutMs: DEFAULT_NETWORK_POLICY.timeoutMs,
    };
  } catch {
    cachedPolicy = { ...DEFAULT_NETWORK_POLICY };
  }
  return cachedPolicy;
}

/** 保存策略（设置面板调用）；写盘失败不阻断内存生效。 */
export function saveNetworkPolicy(policy: NetworkGatePolicy): void {
  cachedPolicy = {
    allowedHosts: [...policy.allowedHosts],
    allowedMethods: policy.allowedMethods ?? DEFAULT_NETWORK_POLICY.allowedMethods,
    maxResponseBytes: policy.maxResponseBytes ?? DEFAULT_NETWORK_POLICY.maxResponseBytes,
    timeoutMs: policy.timeoutMs ?? DEFAULT_NETWORK_POLICY.timeoutMs,
  };
  try {
    fs.writeFileSync(policyFile(), JSON.stringify({ allowedHosts: cachedPolicy.allowedHosts }), 'utf-8');
  } catch (error) {
    logger.warn('plugin-net', '网络门策略写盘失败', error);
  }
}

export interface PluginNetFetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface PluginNetFetchResult {
  ok: boolean;
  status?: number;
  text?: string;
  error?: string;
}

/** 按策略代理一次插件网络请求（纯函数裁决 + 实际 fetch）。 */
export async function performPluginNetFetch(
  policy: NetworkGatePolicy,
  request: PluginNetFetchRequest,
): Promise<PluginNetFetchResult> {
  const decision = evaluateNetworkRequest(policy, { url: request.url, method: request.method });
  if (!decision.allowed) return { ok: false, error: decision.reason };
  const { maxResponseBytes, timeoutMs } = effectiveLimits(policy);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(decision.url, {
      method: decision.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const raw = await response.text();
    const text = raw.length > maxResponseBytes ? raw.slice(0, maxResponseBytes) : raw;
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export function registerPluginNetIpc(): void {
  ipcMain.handle(IPC.plugin.netGetPolicy, () => loadPolicy());
  ipcMain.handle(IPC.plugin.netSetPolicy, async (_event, policy: NetworkGatePolicy) => {
    if (typeof policy !== 'object' || policy === null || !Array.isArray(policy.allowedHosts)) {
      throw new TypeError('Invalid plugin net policy');
    }
    // 白名单变更经用户确认（51 篇）：渲染层被接管时无法静默放行任意主机。
    const hosts = policy.allowedHosts.filter((host): host is string => typeof host === 'string' && host.length > 0);
    const windows = BrowserWindow.getAllWindows();
    const parent = windows[0] ?? null;
    const { response } = parent
      ? await dialog.showMessageBox(parent, {
          type: 'question',
          buttons: [tMain('dialog.netPolicy.confirm'), tMain('dialog.netPolicy.cancel')],
          defaultId: 1,
          cancelId: 1,
          message: tMain('dialog.netPolicy.message'),
          detail: tMain('dialog.netPolicy.detail', { hosts: hosts.length > 0 ? hosts.join(', ') : tMain('dialog.netPolicy.emptyHosts') }),
        })
      : { response: 1 };
    if (response !== 0) return { ok: false as const };
    saveNetworkPolicy({ allowedHosts: hosts });
    return { ok: true as const };
  });
  ipcMain.handle(IPC.plugin.netFetch, (_event, request: PluginNetFetchRequest) => {
    if (typeof request !== 'object' || request === null || typeof request.url !== 'string') {
      throw new TypeError('Invalid plugin:net-fetch arguments');
    }
    return performPluginNetFetch(loadPolicy(), request);
  });
}
