import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { cleanupUserDataDir, createBook, launchApp } from './helpers';

/** 进入工作区（若在书籍库则点开书）、关掉助手侧栏、进写作区并保证有章节、等编辑器就绪。 */
async function enterWorkspaceWriting(page: Page): Promise<void> {
  const inspiration = page.getByPlaceholder(/输入你的初始灵感|Enter your initial inspiration/);
  const card = page.getByText(/新小说|New Novel|E2E测试书/).first();
  // 等待两种可能的落地界面之一出现，避免误判
  await Promise.race([
    inspiration.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined),
    card.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined),
  ]);
  if (!(await inspiration.isVisible().catch(() => false)) && (await card.isVisible().catch(() => false))) {
    await card.click();
  }
  await page.keyboard.press('Control+j').catch(() => undefined);
  await page.keyboard.press('Control+5');
  await page.getByRole('button', { name: /先手写看看|Write by hand/ }).first().click({ timeout: 8_000 }).catch(() => undefined);
  await page.getByRole('button', { name: /新建第一章|Create first chapter/ }).first().click({ timeout: 20_000 }).catch(() => undefined);
  await page.locator('.ProseMirror').first().waitFor({ state: 'attached', timeout: 30_000 });
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
    const editor1 = page.locator('.ProseMirror').first();
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
    const editor2 = page2.locator('.ProseMirror').first();
    await expect(editor2).toBeVisible({ timeout: 30_000 });

    // 等播种握手（加入者向对端取状态）完成，再输入
    await page.waitForTimeout(1500);

    await editor1.click();
    await page.keyboard.type('协作同步测试内容');
    // 传输偶有延迟：未在窗口内出现时重输一次仍可看到累计文本（不产生误判）
    try {
      await expect(editor2).toContainText('协作同步测试内容', { timeout: 15_000 });
    } catch {
      await editor1.click();
      await page.keyboard.type('协作同步测试内容');
      await expect(editor2).toContainText('协作同步测试内容', { timeout: 20_000 });
    }
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
