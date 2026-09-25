import { rmSync } from 'node:fs';
import { expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * E2E 共用启动与建书助手。
 * 用户数据隔离：--user-data-dir 指临时目录，绝不碰真实用户数据。
 * --lang 固定中文：CI 的 Linux 无头环境默认英文，中文选择器会全灭。
 */
export const launchApp = async (userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> => {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, '--lang=zh-CN'],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0', LANG: 'zh_CN.UTF-8', LANGUAGE: 'zh_CN:zh' } as Record<string, string>,
  });
  const deadline = Date.now() + 60_000;
  let page: Page | null = null;
  while (!page && Date.now() < deadline) {
    for (const w of app.windows()) {
      if (!w.url().startsWith('devtools://')) {
        page = w;
        break;
      }
    }
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  expect(page, '应用窗口未出现（仅有 DevTools）').toBeTruthy();
  // 固定窗口尺寸：CI/无头环境默认窗口过窄会把写作区压成 0 宽，交互失败
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.setSize(1400, 900);
      win.center();
    }
  });
  await expect(page!.locator('body')).toBeVisible({ timeout: 30_000 });
  return { app, page: page! };
};

/** 删除本次运行的隔离数据目录（Electron 未释放时静默跳过，避免阻塞清理）。 */
export const cleanupUserDataDir = (dir: string): void => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 进程仍占用时留下，交由系统/后续清理 */
  }
};

/**
 * 等差分落盘完成：走产品真实的退出刷盘握手（main 发 app:flush-request → 渲染层 flushNow → 回 app:flush-done）。
 * 通道名与 src/main/channels.ts 的 IPC 常量一致；替代「sleep 2s 赌防抖 400ms 已落盘」的猜测等待。
 */
export const flushPersistence = async (app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const onDone = (): void => {
        ipcMain.removeListener('app:flush-done', onDone);
        resolve();
      };
      ipcMain.on('app:flush-done', onDone);
      win.webContents.send('app:flush-request');
    });
  });
};

/**
 * 等协作会话就绪（播种握手窗口已过，本地编辑开始推送）：经命令面板打开设置弹层（写作分区
 * 为全屏沉浸、无设置按钮，命令面板全分区可用），切通用页签等协作面板显示「已加入房间」再关闭。
 * 面板状态由 collaborationService 的 sessionState 驱动，是用户可见的真实信号；
 * 替代「sleep 1.5s 赌 400ms 握手已过」的猜测等待。
 */
export const waitCollaborationReady = async (page: Page): Promise<void> => {
  await page.keyboard.press('Control+k');
  const paletteInput = page.getByPlaceholder(/输入命令|Enter a command/).first();
  await expect(paletteInput).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /打开设置|Open settings/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: /^(通用|General)$/ }).first().click();
  await expect(dialog.getByText(/已加入房间|Joined room/)).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden({ timeout: 10_000 });
};

/** 建书进工作台灵感分区（首启走向导跳过，非首启走新建模态）。 */
export const createBook = async (page: Page): Promise<void> => {  const skip = page.getByRole('button', { name: /跳过|Skip/ });
  if (await skip.isVisible({ timeout: 10_000 }).catch(() => false)) {
    // 跳过必须走键盘确认：部分环境下鼠标 click 会被 dialog 动画吞掉（onboarding 不关闭）
    await skip.focus();
    await page.keyboard.press('Enter');
  } else {
    await page.getByRole('button', { name: /新建书籍|New Book/ }).first().click();
    await page.getByPlaceholder(/例如|e\.g\./).fill('E2E测试书');
    await page.getByRole('button', { name: /^(新建书籍|New Book)$/ }).last().click();
  }
  const handwrite = page.getByRole('button', { name: /先手写看看|Write by hand/ });
  if (await handwrite.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await handwrite.click();
  }
  await expect(page.getByPlaceholder(/输入你的初始灵感|Enter your initial inspiration/)).toBeVisible({ timeout: 30_000 });
};

/**
 * 进入工作区写作区：若在书籍库则点开书、关掉助手侧栏、进写作区并保证有章节、等编辑器就绪。
 *
 * 与 e2e/collaboration.spec.ts 长期共用的一套逻辑。三处易错点：
 * - reload 后 `view` 回到书籍库，`handwriteBypass` 重置；
 * - 分区快捷键 `Ctrl+5` 只受 view 门控、不受模型拦截影响；未配置模型时写作区被
 *   「先手写看看」整体挡住，先点掉它首章按钮才出现；
 * - `.catch(() => undefined)` 会吞掉点击失败，最终只表现为编辑器不出现——全部改为显式等待。
 */
export const enterWritingArea = async (page: Page): Promise<void> => {
  const handwrite = page.getByRole('button', { name: /先手写看看|Write by hand/ }).first();
  const createChapter = page.getByRole('button', { name: /新建第一章|Create first chapter/ }).first();

  // 书籍库态（reload 后回到这里）：点开刚建的书进入工作台；已在工作台则工具栏不在，无需点。
  // 判据用书库工具栏而不是书卡：书卡是 div[role=button]，而工作台头部书名按钮的可访问名
  // 同样是书名，两者会互相命中——等「书卡消失」在已进工作台时永远不成立。
  const bookshelfToolbar = page.getByRole('button', { name: /新建书籍|New Book/ }).first();
  if (await bookshelfToolbar.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await page
      .locator('div[role="button"][tabindex="0"]')
      .filter({ hasText: /新小说|New Novel|E2E测试书/ })
      .first()
      .click({ timeout: 10_000 });
  }

  // 关闭助手侧栏
  await page.keyboard.press('Control+j').catch(() => undefined);

  // 工作台已进入的标志：手写豁免按钮（未配置模型）或首章创建按钮（已豁免）
  await expect(handwrite.or(createChapter).first()).toBeVisible({ timeout: 30_000 });

  // 模型未配置时写作区被整体拦截：先解除豁免，再切到写作区
  await page.keyboard.press('Control+5').catch(() => undefined);
  if (await handwrite.isVisible().catch(() => false)) {
    await handwrite.click({ timeout: 10_000 });
    await expect(handwrite).toBeHidden({ timeout: 10_000 });
    await page.keyboard.press('Control+5');
  }

  await expect(createChapter).toBeVisible({ timeout: 30_000 });
  await createChapter.click();
  await expect(page.locator('.ProseMirror').first()).toBeAttached({ timeout: 30_000 });
};
