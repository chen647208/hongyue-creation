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
