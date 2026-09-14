/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 插件受控网络门（docs/design/40 §4）：默认拒绝，白名单放行。
 *
 * 联网搜索/翻译等插件不直接持有 fetch，只能提交请求给主进程；主进程按策略放行：
 *   - 未配置允许域名即拒绝（默认拒绝）；
 *   - 只允许 https（本机回环允许 http，供本地推理端点）；
 *   - 域名精确匹配，或 `*.example.com` 匹配其子域（不匹配裸域）；
 *   - 拒绝带用户名/口令的 URL，方法须在允许集合内。
 *
 * 纯函数，零依赖；主进程执行实际请求，本层只做裁决。
 */

export interface NetworkGatePolicy {
  /** 允许的域名；`*.suffix` 表示子域。空数组即拒绝全部。 */
  allowedHosts: readonly string[];
  /** 允许的 HTTP 方法；缺省 GET/POST。 */
  allowedMethods?: readonly string[];
  /** 响应体上限（字节）。 */
  maxResponseBytes?: number;
  /** 超时（毫秒）。 */
  timeoutMs?: number;
}

export const DEFAULT_NETWORK_POLICY: NetworkGatePolicy = {
  allowedHosts: [],
  allowedMethods: ['GET', 'POST'],
  maxResponseBytes: 256 * 1024,
  timeoutMs: 15_000,
};

export interface NetworkRequest {
  url: string;
  method?: string;
}

export type NetworkGateDecision =
  | { allowed: true; url: string; host: string; method: string }
  | { allowed: false; reason: string };

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/** 域名匹配：精确或通配子域（`*.example.com` 命中 a.example.com，不命中 example.com）。 */
export function hostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  const target = host.toLowerCase();
  for (const raw of allowedHosts) {
    const pattern = raw.trim().toLowerCase();
    if (!pattern) continue;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // '.example.com'
      if (target.endsWith(suffix) && target.length > suffix.length) return true;
    } else if (target === pattern) {
      return true;
    }
  }
  return false;
}

/** 裁决一次插件网络请求；默认拒绝未知来源与非安全协议。 */
export function evaluateNetworkRequest(
  policy: NetworkGatePolicy,
  request: NetworkRequest,
): NetworkGateDecision {
  if (policy.allowedHosts.length === 0) {
    return { allowed: false, reason: '未配置允许域名（默认拒绝所有插件网络请求）' };
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return { allowed: false, reason: `非法 URL：${request.url}` };
  }
  if (url.username || url.password) {
    return { allowed: false, reason: 'URL 不允许携带用户名或口令' };
  }
  const isHttps = url.protocol === 'https:';
  const isLoopbackHttp = url.protocol === 'http:' && isLoopbackHost(url.hostname);
  if (!isHttps && !isLoopbackHttp) {
    return { allowed: false, reason: `插件网络仅允许 https（本机回环可用 http），实际 ${url.protocol}` };
  }
  if (!hostAllowed(url.hostname, policy.allowedHosts)) {
    return { allowed: false, reason: `域名不在白名单：${url.hostname}` };
  }
  const method = (request.method ?? 'GET').toUpperCase();
  const allowedMethods = policy.allowedMethods ?? DEFAULT_NETWORK_POLICY.allowedMethods ?? ['GET', 'POST'];
  if (!allowedMethods.includes(method)) {
    return { allowed: false, reason: `方法不在允许集合：${method}` };
  }
  return { allowed: true, url: url.toString(), host: url.hostname, method };
}

/** 响应用上限与超时（缺省取自策略）。 */
export function effectiveLimits(policy: NetworkGatePolicy): { maxResponseBytes: number; timeoutMs: number } {
  return {
    maxResponseBytes: policy.maxResponseBytes ?? DEFAULT_NETWORK_POLICY.maxResponseBytes ?? 256 * 1024,
    timeoutMs: policy.timeoutMs ?? DEFAULT_NETWORK_POLICY.timeoutMs ?? 15_000,
  };
}
