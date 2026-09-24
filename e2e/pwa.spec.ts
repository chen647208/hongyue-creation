import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * 离线壳（Service Worker）端到端：拿真实构建产物 build/renderer 跑浏览器，不用 Electron。
 *
 * 为什么单独一个用例：注册门 `registerServiceWorker.ts` 在 Electron 下恒为 false
 * （桌面环境走本地加载，不注册离线壳），所以这条路径只有真实浏览器能验。
 *
 * 覆盖：SW 注册成功 → 断网后仍能加载应用壳 → 缓存名带构建版本号（版本一变，
 * 旧版本缓存就在 activate 时被清掉，这是 sw.ts 的失效机制）。
 */

const RENDERER_DIR = join(process.cwd(), 'build', 'renderer');

/** package.json 版本，用于核对缓存名里的版本段（与 sw.ts 的 __SW_VERSION__ 同一来源）。 */
const APP_VERSION = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).version as string;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

/** 静态托管 build/renderer；路径越界返回 403，不泄露目录外文件。 */
async function serveRenderer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    // 目录请求落到 index.html：SPA 壳的入口，也是 SW 预缓存清单里的 './'。
    const requested = decodeURIComponent(url.pathname).split('..').join('');
    const relative = normalize(requested.endsWith('/') ? `${requested}index.html` : requested);
    const filePath = join(RENDERER_DIR, relative);
    if (!filePath.startsWith(RENDERER_DIR)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    try {
      const body = readFileSync(filePath);
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** 等 SW 接管页面；不接管就谈不上离线回退。 */
async function waitForController(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 30_000 });
}

test.describe('离线壳 service worker（build/renderer 真实产物）', () => {
  test('注册成功、断网可再加载、缓存名带构建版本', async ({ page, context }) => {
    const server = await serveRenderer();
    try {
      await page.goto(server.baseUrl);

      // 注册门在纯浏览器生产构建下为 true：页面加载后应出现受控的 SW。
      await waitForController(page);
      const scope = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return registration.active?.scriptURL ?? null;
      });
      expect(scope, 'service worker 未激活').toContain('sw.js');

      // 预缓存应用壳：activate 时会留下一个带版本号的缓存。
      const cacheNames = await page.evaluate(() => window.caches.keys());
      const shellCache = cacheNames.find((name) => name.startsWith('hongyue-shell-'));
      expect(shellCache, `未找到应用壳缓存，现有缓存：${cacheNames.join(', ')}`).toBeTruthy();
      expect(shellCache).toBe(`hongyue-shell-${APP_VERSION}`);

      // 断网回退：网络优先失败时用缓存的 index.html，应用壳仍能起来。
      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('#root')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/红月创作|Hongyue Creation/).first()).toBeVisible({ timeout: 30_000 });
      await context.setOffline(false);
    } finally {
      await server.close();
    }
  });
});
