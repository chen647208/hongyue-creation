import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { cleanupUserDataDir, createBook, launchApp } from './helpers';

/**
 * 整库导出端到端：系统保存对话框在主进程桩化到临时路径，
 * 直接调用渲染层 repository.exportAll，断言成功提示是自动消失的 toast、带保存路径，且落盘成功。
 */
test('整库导出成功走自动消失 toast 并带保存路径', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-export-all-'));
  const exportPath = join(userDataDir, 'all-data-export.json');

  const { app, page } = await launchApp(userDataDir);
  try {
    // 走完首启向导让弹层关闭，避免遮罩影响 toast 可见性
    await createBook(page);
    await page.getByRole('button', { name: /书籍库|Bookshelf/ }).first().click();

    await app.evaluate(({ dialog }, target) => {
      const d = dialog as unknown as {
        showSaveDialog: () => Promise<{ canceled: boolean; filePath: string }>;
      };
      d.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, exportPath);

    const exportError = await page.evaluate(async (state) => {
      try {
        const { repository } = await import('/shared/services/repository/index.ts');
        await repository.exportAll(state as never);
        return null;
      } catch (error) {
        return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      }
    }, { projects: [], activeProjectId: null });
    expect(exportError, '渲染层整库导出抛错').toBeNull();

    const successToast = page.getByRole('status').filter({ hasText: /全部数据导出成功|All data exported successfully/ });
    await expect(successToast).toBeVisible({ timeout: 15_000 });
    await expect(successToast).toContainText(exportPath);
    await expect.poll(() => existsSync(exportPath), { timeout: 15_000 }).toBe(true);
    expect(JSON.parse(readFileSync(exportPath, 'utf8'))).toMatchObject({ projects: [] });
    // 自动消失，不需要手动点掉
    await expect(successToast).toBeHidden({ timeout: 10_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
