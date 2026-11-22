import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { cleanupUserDataDir, createBook, launchApp } from './helpers';

/**
 * 导出/导入书籍端到端：系统文件对话框在主进程桩化到临时路径，
 * 覆盖"渲染端 → IPC → 主进程写/读文件"的完整往返。
 */
test('导出书籍后能再导入，书籍标题出现', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-io-'));
  const exportPath = join(userDataDir, 'book-export.json');
  const importPath = join(userDataDir, 'book-import.json');
  writeFileSync(importPath, JSON.stringify({
    id: 'imp-1', title: '导入测试书', inspiration: '', intro: '', outline: '',
    chapters: [], virtualChapters: [], knowledge: [], characters: [], lastModified: 1,
  }));

  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.getByRole('button', { name: /书籍库|Bookshelf/ }).first().click();

    // 桩：保存/打开对话框固定到临时路径
    await app.evaluate(({ dialog }, paths) => {
      const d = dialog as unknown as {
        showSaveDialog: () => Promise<{ canceled: boolean; filePath: string }>;
        showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      };
      d.showSaveDialog = async () => ({ canceled: false, filePath: paths.exportPath });
      d.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.importPath] });
    }, { exportPath, importPath });

    // 导出：卡片菜单 → 导出
    await page.locator('button:has(.lucide-ellipsis)').first().click();
    await page.getByRole('menuitem', { name: '导出', exact: true }).click();
    // 成功提示是自动消失的 toast，带保存路径，不阻塞后续导入
    const successToast = page.getByRole('status').filter({ hasText: /导出成功|exported successfully/ });
    await expect(successToast).toBeVisible({ timeout: 15_000 });
    await expect(successToast).toContainText(exportPath);
    await expect.poll(() => existsSync(exportPath), { timeout: 15_000 }).toBe(true);
    const exported = JSON.parse((await import('node:fs')).readFileSync(exportPath, 'utf8')) as { title: string };
    expect(exported.title).toBeTruthy();
    await expect(successToast).toBeHidden({ timeout: 10_000 });

    // 导入：导入下拉 → 导入书籍
    await page.getByRole('button', { name: /导入|Import/ }).first().click();
    await page.getByRole('menuitem', { name: /导入书籍|Import Book/ }).click();
    await expect(page.getByText('导入测试书').first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
