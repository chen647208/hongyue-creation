import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { cleanupUserDataDir, createBook, flushPersistence, launchApp } from './helpers';

test('朗读设置：系统引擎试听、切换引擎换配置项、保存后重启保留', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-tts-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.keyboard.press('Control+1');
    await page.getByRole('button', { name: /^设置$|^Settings$/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: /^(朗读|Speech)$/ }).first().click();

    // 系统引擎：试听期间按钮变「停止」
    await dialog.getByRole('button', { name: /^试听$|^Preview$/ }).click();
    const stop = dialog.getByRole('button', { name: /^停止$|^Stop$/ });
    await expect(stop).toBeVisible({ timeout: 10_000 });
    await stop.click();

    // 切到 OpenAI 兼容：出现接口地址 / 模型 / Key 三项
    await page.locator('#tts-provider').click();
    await page.getByRole('option', { name: /OpenAI/ }).click();
    await expect(page.locator('#tts-endpoint')).toBeVisible();
    await expect(page.locator('#tts-model')).toBeVisible();
    await expect(page.locator('#tts-apikey')).toBeVisible();

    // 语速改到 1.5 后保存并退出
    await page.locator('#tts-rate').fill('1.5');
    await dialog.getByRole('button', { name: /^应用并保存配置$|^Apply and save$/ }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // 走真实刷盘握手，确保设置差分落库后再重启
    await flushPersistence(app);
    await app.close();
    const relaunched = await launchApp(userDataDir);
    try {
      // 重启回到书籍库：首启向导若仍在先跳过，再进设置
      // 重启后的落点视恢复而定：命令面板全分区可用，优先用它打开设置
      await relaunched.page.keyboard.press('Control+k');
      const palette = relaunched.page.getByPlaceholder(/输入命令|Enter a command/).first();
      await expect(palette).toBeVisible({ timeout: 30_000 });
      await relaunched.page.getByRole('button', { name: /打开设置|Open settings/ }).first().click();
      const dialog2 = relaunched.page.getByRole('dialog');
      await expect(dialog2).toBeVisible({ timeout: 30_000 });
      await dialog2.getByRole('button', { name: /^(朗读|Speech)$/ }).first().click();
      await expect(relaunched.page.locator('#tts-endpoint')).toBeVisible();
      await expect(relaunched.page.locator('#tts-rate')).toHaveValue('1.5');
    } finally {
      await relaunched.app.close();
    }
  } finally {
    cleanupUserDataDir(userDataDir);
  }
});
