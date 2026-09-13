import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { cleanupUserDataDir, createBook, launchApp } from './helpers';

test('世界分区：数据视图与双轴时间线面板可开合', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-world-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.keyboard.press('Control+2');

    const dataViewsToggle = page.getByRole('button', { name: /数据视图/ }).first();
    await expect(dataViewsToggle).toBeVisible({ timeout: 15_000 });
    await dataViewsToggle.click();
    const outline = page.getByRole('button', { name: /^大纲$/ });
    await expect(outline).toBeVisible({ timeout: 10_000 });
    await outline.click();

    const timelineToggle = page.getByRole('button', { name: /双轴时间线/ }).first();
    await timelineToggle.click();
    await expect(page.getByRole('button', { name: /添加标记/ })).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
