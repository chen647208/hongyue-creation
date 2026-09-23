/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/**
 * 离线壳 service worker（docs/design/35）。
 *
 * 由 `scripts/build-service-worker.mjs` 用 esbuild 编译到 `build/renderer/sw.js`；
 * Electron（file:// 或存在 electronAPI）与开发环境不注册。
 *
 * 缓存策略：
 * - 安装时预缓存应用壳：文档入口、manifest 与图标。
 * - 导航请求网络优先，断网回退到缓存的 index.html（离线可开壳）。
 * - 同源 GET 静态资源（脚本/样式/字体/图片）网络优先，成功即回填缓存；断网回退缓存。
 * - 非 GET、跨源请求不拦截。
 * 失效：缓存名带构建版本号，activate 时清掉旧版本缓存；在线导航始终取最新 index.html。
 */
declare const __SW_VERSION__: string;
declare const __SW_PRECACHE__: string[];

interface CacheLike {
  addAll(requests: string[]): Promise<void>;
  put(request: Request, response: Response): Promise<void>;
  match(request: Request | string): Promise<Response | undefined>;
}

interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
  match(request: Request | string): Promise<Response | undefined>;
}

interface WaitableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends WaitableEventLike {
  request: Request;
  respondWith(response: Promise<Response>): void;
}

interface ServiceWorkerScopeLike {
  addEventListener(type: 'install' | 'activate', listener: (event: WaitableEventLike) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  skipWaiting(): void;
  clients: { claim(): Promise<void> };
}

const scopeGlobal: unknown = self;
const scope = scopeGlobal as ServiceWorkerScopeLike;
const cacheStorage = caches as CacheStorageLike;

const CACHE_NAME = `hongyue-shell-${__SW_VERSION__}`;
/** 构建期算全的预缓存清单（见 scripts/build-service-worker.mjs）：应用壳 + 全部 assets。 */
const APP_SHELL = __SW_PRECACHE__;

scope.addEventListener('install', (event) => {
  event.waitUntil(
    cacheStorage
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => scope.skipWaiting()),
  );
});

scope.addEventListener('activate', (event) => {
  event.waitUntil(
    cacheStorage
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => cacheStorage.delete(key))))
      .then(() => scope.clients.claim()),
  );
});

/** 网络优先，失败回退缓存；网络成功时把响应回填缓存。 */
async function networkFirst(request: Request, fallback: Request | string): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await cacheStorage.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cacheStorage.match(fallback);
    if (cached) return cached;
    throw new Error('离线且无可用缓存');
  }
}

scope.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request, request.mode === 'navigate' ? './index.html' : request));
});
