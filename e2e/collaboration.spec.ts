import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { cleanupUserDataDir, createBook, launchApp } from './helpers';

/** 进入工作区（若在书籍库则点开书）、关掉助手侧栏、进写作区并保证有章节。 */
async function enterWorkspaceWriting(page: Page): Promise<void> {
  const inspiration = page.getByPlaceholder(/输入你的初始灵感|Enter your initial inspiration/);
  if (!(await inspiration.isVisible({ timeout: 10_000 }).catch(() => false))) {
    const card = page.getByText(/新小说|New Novel|E2E测试书/).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
  }
  await page.keyboard.press('Control+j').catch(() => undefined);
  await page.keyboard.press('Control+5');
  await page.getByRole('button', { name: /先手写看看|Write by hand/ }).first().click({ timeout: 8_000 }).catch(() => undefined);
  await page.getByRole('button', { name: /新建第一章|Create first chapter/ }).first().click({ timeout: 30_000 }).catch(() => undefined);
}

test('实时协作：两个窗口同步章节正文', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-collab-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    // 等差分落盘（防抖 400ms），再开协作并 reload 让启动时读到开关
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.localStorage.setItem('collab.enabled', '1'));
    await page.reload();
    await enterWorkspaceWriting(page);
    const editor1 = page.locator('[contenteditable="true"]:visible').first();
    await expect(editor1).toBeVisible({ timeout: 30_000 });

    // 第二个窗口：同进程同 origin，共享 localStorage 与 BroadcastChannel
    const url = page.url();
    await app.evaluate(async ({ BrowserWindow }, devUrl) => {
      const preload = `${process.cwd()}/build/main/preload/preload.js`;
      const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false },
      });
      await win.loadURL(devUrl);
    }, url);

    const pages = app.windows();
    const page2 = pages[pages.length - 1];
    if (!page2) throw new Error('第二个窗口未创建');
    await page2.waitForLoadState('domcontentloaded');
    await enterWorkspaceWriting(page2);
    const editor2 = page2.locator('[contenteditable="true"]:visible').first();
    await expect(editor2).toBeVisible({ timeout: 30_000 });

    await editor1.click();
    await page.keyboard.type('协作同步测试内容');
    await expect(editor2).toContainText('协作同步测试内容', { timeout: 20_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
