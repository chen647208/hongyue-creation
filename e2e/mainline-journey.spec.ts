import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

import { cleanupUserDataDir, createBook, flushPersistence, launchApp } from './helpers';

/**
 * 主线旅程回归（审计 2026-11-22）：
 * 手写豁免跨重启保留、窄窗口正文列不被侧栏压扁、首启「开始写」不再自动弹整座设置。
 */

test('先手写看看跨重启保留：再次进写作区不再被模型拦截', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-journey-'));
  const first = await launchApp(userDataDir);
  try {
    // 首启向导点跳过即建书并进入工作台，再到拦截页点「先手写看看」
    await createBook(first.page);
    await flushPersistence(first.app);
  } finally {
    await first.app.close();
  }

  const second = await launchApp(userDataDir);
  try {
    // 重启落回书籍库：点开刚建的书
    await second.page
      .locator('div[role="button"][tabindex="0"]')
      .filter({ hasText: /新小说|New Novel|E2E测试书/ })
      .first()
      .click({ timeout: 30_000 });

    // 不再出现整页拦截；写作分区直接给建章入口
    await second.page.keyboard.press('Control+5');
    await expect(second.page.getByRole('button', { name: /先手写看看|Write by hand/ })).toHaveCount(0);
    await expect(
      second.page.getByRole('button', { name: /新建第一章|Create first chapter/ }).first(),
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    await second.app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('829px 窄窗口：正文列宽度不小于 320px，两侧栏不并排挤压', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-journey-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    // 内容区固定 829×700（审计实测的窄窗口尺寸）。
    // 开发模式 DevTools 停靠会先吃掉窗口宽度，产品窗口最小宽 1200：测试里先关 DevTools、
    // 放宽最小尺寸，才能得到真实 829px 的 CSS 视口。
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      win.webContents.closeDevTools();
      win.setMinimumSize(400, 400);
      win.setContentSize(829, 700);
    });
    await expect
      .poll(() => page.evaluate(() => window.innerWidth), { timeout: 15_000 })
      .toBe(829);

    await page.keyboard.press('Control+5');
    const createFirst = page.getByRole('button', { name: /新建第一章|Create first chapter/ }).first();
    await expect(createFirst).toBeVisible({ timeout: 30_000 });
    await createFirst.click();
    await expect(page.locator('.ProseMirror').first()).toBeAttached({ timeout: 30_000 });

    const editorWidth = await page
      .locator('.ProseMirror')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(editorWidth).toBeGreaterThanOrEqual(320);

    // 返回书籍库入口在 829px 覆盖层布局下仍完整落在视口内
    const bookshelfExit = page.getByRole('button', { name: /返回书籍库|Back to bookshelf/ });
    await expect(bookshelfExit).toBeVisible();
    const exitBox = await bookshelfExit.boundingBox();
    expect(exitBox).not.toBeNull();
    expect(exitBox!.x).toBeGreaterThanOrEqual(0);
    expect(exitBox!.x + exitBox!.width).toBeLessThanOrEqual(829);
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('写作区可点「书架」返回书籍库，无历史时章节历史按钮可见但禁用', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-journey-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.keyboard.press('Control+5');
    const createFirst = page.getByRole('button', { name: /新建第一章|Create first chapter/ }).first();
    await expect(createFirst).toBeVisible({ timeout: 30_000 });
    await createFirst.click();
    await expect(page.locator('.ProseMirror').first()).toBeAttached({ timeout: 30_000 });

    // 新章没有 AI 历史：按钮常驻但置灰，可访问名说明何时会产生历史
    const chapterHistory = page.getByRole('button', { name: /保存或 AI 改稿后会生成章节历史|History appears after/ });
    await expect(chapterHistory).toBeVisible({ timeout: 30_000 });
    await expect(chapterHistory).toBeDisabled();

    // 返回入口常驻、键盘可达：聚焦后回车回到书籍库
    const bookshelf = page.getByRole('button', { name: /返回书籍库|Back to bookshelf/ });
    await expect(bookshelf).toBeVisible();
    await bookshelf.focus();
    await expect(bookshelf).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /新建书籍|New Book/ }).first()).toBeVisible({ timeout: 30_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('首启向导点「开始写」直接进工作台，不自动弹设置', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-journey-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    const start = page.getByRole('button', { name: /^开始写$|^Start writing$/ });
    await expect(start).toBeVisible({ timeout: 30_000 });
    await start.click();

    const settingsDialog = page.getByRole('dialog', { name: /控制台配置|Console Settings/ });
    // 建书后直接落到工作台：未配置模型时是拦截页，首章入口在写作区；设置弹窗不自动出现
    await expect(page.getByRole('button', { name: /先手写看看|Write by hand/ })).toBeVisible({ timeout: 30_000 });
    await expect(settingsDialog).toHaveCount(0);
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
