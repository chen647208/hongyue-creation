import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { cleanupUserDataDir, createBook, launchApp } from './helpers';

/**
 * 视觉回归：截取工作台左侧导航栏（结构稳定），按平台存基线。
 * 跨 OS 字体/渲染有差异，故默认跳过，仅在本机跑 `npm run test:e2e:visual` 生成/校验基线。
 */
test.skip(!process.env.VISUAL, '视觉回归默认跳过；用 npm run test:e2e:visual 运行');

test('工作台导航栏视觉快照', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-visual-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    const nav = page.locator('aside').first();
    await expect(nav).toBeVisible({ timeout: 30_000 });
    await expect(nav).toHaveScreenshot('workspace-nav.png', { maxDiffPixelRatio: 0.02, animations: 'disabled' });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('命令面板视觉快照', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-visual-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.keyboard.press('Control+K');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toHaveScreenshot('command-palette.png', { maxDiffPixelRatio: 0.02, animations: 'disabled' });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('写作区空态视觉快照', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-visual-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.keyboard.press('Control+5');
    await expect(page.getByRole('button', { name: /新建第一章|Create first chapter/ })).toBeVisible({ timeout: 30_000 });
    // 遮罩顶栏：版本号等随构建变化，不入快照
    await expect(page).toHaveScreenshot('writing-empty.png', {
      mask: [page.locator('header')],
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
