import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, _electron as electron, type Page } from '@playwright/test';
import { cleanupUserDataDir } from './helpers';

/**
 * 启动冒烟：开发模式 Electron 能亮应用窗、无渲染进程致命错误即过。
 * 用户数据隔离：--user-data-dir 指临时目录，绝不碰真实用户数据。
 * DevTools 会自动弹出（开发模式行为）：只认非 devtools:// 的应用窗。
 */
test('dev app launches with a visible app window', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-'));
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' } as Record<string, string>,
  });
  try {
    let page: Page | null = null;
    const deadline = Date.now() + 60_000;
    while (!page && Date.now() < deadline) {
      for (const w of app.windows()) {
        if (!w.url().startsWith('devtools://')) {
          page = w;
          break;
        }
      }
      if (!page) await new Promise((r) => setTimeout(r, 500));
    }
    expect(page, '应用窗口未出现（仅有 DevTools）').toBeTruthy();
    await expect(page!.locator('body')).toBeVisible({ timeout: 30_000 });

    // 设计令牌回归：浅色下 body 背景必须是不透明实色（令牌链断裂会变成透明 → 蒙版透出、整屏发灰）
    const bg = await page!.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(250, 250, 249)');

    const errors: string[] = [];
    page!.on('pageerror', (error) => errors.push(String(error)));
    page!.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    // 观察窗：等书架主界面渲染完成再收口（替代固定 5 秒盲等）
    await page!.getByText(/书籍库|Bookshelf/).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page!.waitForTimeout(1_000);
    expect(errors, JSON.stringify(errors.slice(0, 5))).toEqual([]);
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
