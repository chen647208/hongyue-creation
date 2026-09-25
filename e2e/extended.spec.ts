import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

import { flushPersistence } from './helpers';
import { cleanupUserDataDir, launchApp, createBook } from './helpers';

/**
 * 扩展回归（无 AI Key 可跑）：章节拆分/合并、自动备份落盘、主题持久化。
 * 用户数据隔离：--user-data-dir 指临时目录，绝不碰真实用户数据。
 */

test('章节拆分与合并：光标处拆出新章，再合并回本章', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-split-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    // 进写作分区，建第一章
    await page.keyboard.press('Control+5');
    const firstChapter = page.getByRole('button', { name: /新建第一章|Create first chapter/ });
    await expect(firstChapter).toBeVisible({ timeout: 30_000 });
    await firstChapter.click();
    // 无头/窄窗口下写作画布可能被侧栏挤到 0 宽，用 DOM 焦点而非可见性判定
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'attached', timeout: 30_000 });
    await editor.focus();
    await expect(page.locator('.ProseMirror.focus-visible, .ProseMirror.ProseMirror-focused').first()).toBeAttached({ timeout: 10_000 });
    await page.keyboard.type('第一段AAA');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('第二段BBB');
    // 光标移到文中（文首后右移几格），满足拆分位置要求
    await page.keyboard.press('Control+Home');
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight');

    const splitBtn = page.locator('[title="从光标处拆分为新章"]');
    await expect(splitBtn).toBeEnabled({ timeout: 15_000 });
    await splitBtn.click();
    // 拆出新章（标题带“（续）”），章节列表出现两条
    await expect(page.getByText(/（续）/).first()).toBeVisible({ timeout: 15_000 });

    // 拆出后停在末章，合并按钮应禁用；点回首章（列表点击会开生成弹窗，走“仅进入编辑器”）再合并
    await expect(page.locator('[title="与下一章合并"]')).toBeDisabled();
    await page.locator('[title="删除《第1章》"]').locator('xpath=..').click();
    await page.getByRole('button', { name: /仅进入编辑器|Editor only/ }).click();
    const mergeBtn = page.locator('[title="与下一章合并"]');
    await expect(mergeBtn).toBeEnabled({ timeout: 15_000 });
    await mergeBtn.click();
    await page.getByRole('button', { name: /^确定$/ }).click();
    await expect(page.getByText(/（续）/)).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('自动备份按间隔落盘（预置 5 秒间隔）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-backup-'));
  // 预置存储配置：自动备份开、间隔 5 秒（默认 30 秒对测试过长）
  writeFileSync(
    join(userDataDir, 'storage-config.json'),
    JSON.stringify({ dataPath: '', useCustomPath: false, autoBackupEnabled: true, autoBackupInterval: 5, maxBackupFiles: 5 }),
  );
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.getByPlaceholder(/输入你的初始灵感|Enter your initial inspiration/).fill('自动备份回归');
    // 自动备份按固定间隔触发：轮询等首个备份文件出现（上限 30s，出现即走）
    const backupDir = join(userDataDir, 'backups');
    await expect
      .poll(() => {
        if (!existsSync(backupDir)) return 0;
        return readdirSync(backupDir).filter((f) => f.startsWith('novalist-backup-') && f.endsWith('.json')).length;
      }, { timeout: 30_000, intervals: [1_000, 2_000, 5_000] })
      .toBeGreaterThan(0);
    const files = readdirSync(backupDir).filter((f) => f.startsWith('novalist-backup-') && f.endsWith('.json'));
    expect(files.length, '未按间隔生成备份文件').toBeGreaterThan(0);
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('主题切换后重启保持（深色持久化）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-theme-'));
  const first = await launchApp(userDataDir);
  try {
    await createBook(first.page);
    await first.page.locator('[title="切换到深色主题"]').click();
    await expect(first.page.locator('html.dark')).toHaveCount(1, { timeout: 10_000 });
    await flushPersistence(first.app);
  } finally {
    await first.app.close();
  }

  const second = await launchApp(userDataDir);
  try {
    await expect(second.page.locator('html.dark')).toHaveCount(1, { timeout: 30_000 });
  } finally {
    await second.app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('命令面板：Ctrl+K 打开、过滤并在执行后关闭', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-cmdk-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.keyboard.press('Control+k');
    const input = page.getByPlaceholder(/输入命令|Type a command/);
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('检索');
    await expect(page.getByRole('button', { name: /全文检索|Full-text search/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(input).toBeHidden({ timeout: 10_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('模态键盘契约：打开后焦点进入，Esc 关闭', async () => {  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-dialog-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    // 回书籍库（经命令面板，避免依赖固定快捷键）
    await page.keyboard.press('Control+k');
    const palette = page.getByPlaceholder(/输入命令|Type a command/);
    await expect(palette).toBeVisible({ timeout: 10_000 });
    await palette.fill('书架');
    await page.getByRole('button', { name: /返回书架|Back to bookshelf/ }).first().click();

    await page.getByRole('button', { name: /新建书籍|New Book/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // 焦点进入模态内部（Radix Dialog 焦点陷阱）
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    // Esc 关闭
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 10_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('查找替换：Ctrl+F 打开并全部替换', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-find-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.keyboard.press('Control+5');
    await page.getByRole('button', { name: /新建第一章|Create first chapter/ }).click();
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'attached', timeout: 30_000 });
    await editor.focus();
    await expect(page.locator('.ProseMirror.ProseMirror-focused').first()).toBeAttached({ timeout: 10_000 });
    await page.keyboard.type('aaa bbb aaa');

    await page.keyboard.press('Control+f');
    const query = page.getByPlaceholder(/查找|Search|Find/);
    await expect(query).toBeVisible({ timeout: 10_000 });
    await query.fill('aaa');
    await page.getByPlaceholder(/替换为|Replace/).fill('ccc');
    await page.locator('[title="全部替换"]').click();
    await expect(editor).toContainText('ccc bbb ccc', { timeout: 10_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('数据库损坏：启动给出加载失败提示，不静默当空书库', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-corrupt-'));
  // 预置一个非 SQLite 文件的 hongyue.db，触发打开/迁移失败
  writeFileSync(join(userDataDir, 'hongyue.db'), 'this is not a sqlite database');
  const { app, page } = await launchApp(userDataDir);
  try {
    const alert = page.getByRole('dialog').filter({ hasText: /加载失败|完整性检查未通过|load failed|integrity/i });
    await expect(alert).toBeVisible({ timeout: 30_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('设置：打开数据存储页显示存储管理', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-settings-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.getByRole('button', { name: '设置' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: '数据存储' }).click();
    await expect(page.getByText('数据存储管理')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /检查完整性|完整性/ })).toBeVisible();
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('数据库加密：状态可见，启用需二次确认（可取消）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-encrypt-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.getByRole('button', { name: '设置' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: '数据存储' }).click();

    // 加密区块始终可见：标题 + 状态/操作
    await expect(page.getByText('数据库加密')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: '用恢复码解锁' })).toBeVisible();

    const enable = page.getByRole('button', { name: '启用加密' });
    if (await enable.isVisible().catch(() => false)) {
      await enable.click();
      const confirmEnable = page.getByRole('dialog').filter({ hasText: /启用后数据库会立即加密/ });
      await expect(confirmEnable).toBeVisible({ timeout: 20_000 });
      // 取消：不启用
      await confirmEnable.getByRole('button', { name: '取消' }).click();
      await expect(confirmEnable).toBeHidden({ timeout: 10_000 });
    }
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});