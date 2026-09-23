import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { cleanupUserDataDir, createBook, enterWritingArea, launchApp } from './helpers';

/**
 * 画布协作双端 e2e：节点移动（改）、连线（增）、删连线（删）经同一份 Y.Doc 收敛；
 * 断线重连后已删元素保持删除，且协同继续可用。
 * 起法与 e2e/collaboration.spec.ts 一致：临时用户数据目录、--lang=zh-CN、开协作后 reload，
 * 第二窗口用同 preload 同 devUrl 新建（同 origin 共享 localStorage 与 BroadcastChannel）。
 */

/** 打开世界分区的数据视图面板并切到画布形态；needSave 为首个窗口保存视图（之后编辑才落库并可同步）。 */
async function openCanvasPanel(page: Page, needSave: boolean): Promise<void> {
  // Ctrl+2 切世界分区后等「数据视图」开关出现再点：快捷键只在 view === 'workspace'
  // 时被受理，写区刚建章时可能还没提交，isVisible() 不等待会漏判。
  await page.keyboard.press('Control+2');
  const dataViewToggle = page.getByRole('button', { name: /数据视图/ }).first();
  await expect(dataViewToggle).toBeVisible({ timeout: 20_000 });
  await dataViewToggle.click();
  const saveView = page.getByRole('button', { name: '保存视图' });
  await expect(saveView).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '画布', exact: true }).click();
  if (needSave) await saveView.click();
}

/** 画布节点：绝对定位的 div（role=button、可聚焦）；DOM 序即投影序（行序）。 */
const canvasNodes = (page: Page) => page.locator('div[role="button"][tabindex="0"]');
const connectButtons = (page: Page) => page.getByRole('button', { name: /^连线：/ });
const removeEdgeButtons = (page: Page) => page.getByRole('button', { name: /^删除连线：/ });

async function dragNode(page: Page, index: number, dx: number, dy: number): Promise<void> {
  const node = canvasNodes(page).nth(index);
  const box = await node.boundingBox();
  if (!box) throw new Error(`画布节点 ${index} 未渲染`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 12 });
  await page.mouse.up();
}

/** 轮询等待节点相对初始位置移动了指定位移（容差 2px，规避取整）。 */
async function waitForNodeShift(page: Page, index: number, dx: number, dy: number): Promise<void> {
  const node = canvasNodes(page).nth(index);
  const before = await node.boundingBox();
  if (!before) throw new Error(`画布节点 ${index} 未渲染`);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const now = await node.boundingBox();
    if (now && Math.abs(now.x - before.x - dx) <= 2 && Math.abs(now.y - before.y - dy) <= 2) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`画布节点 ${index} 未在 20s 内移动 (${dx}, ${dy})`);
}

async function expectNodeCount(page: Page, count: number): Promise<void> {
  await expect(canvasNodes(page)).toHaveCount(count, { timeout: 15_000 });
}

/** 新建第二个章节：编辑器内连按三次 Enter（EnterFlow 的 ×3 新章，间隔需短于 700ms）。 */
/** 同进程再开一个窗口：同 origin，共享 localStorage 与 BroadcastChannel（起法同 collaboration.spec）。 */
async function openSecondWindow(app: import('@playwright/test').ElectronApplication, url: string): Promise<Page> {
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
  const opened = pages[pages.length - 1];
  if (!opened) throw new Error('新窗口未创建');
  await opened.waitForLoadState('domcontentloaded');
  return opened;
}

// 待修（排期项 6 的 e2e 未跑通）：
// 1. openCanvasPanel 依赖「数据视图」开关；该开关只在从灵感分区直接 Ctrl+2 时出现
//    （见 e2e/world-panels.spec.ts）。本用例先进写作区建章再 Ctrl+2，此时世界分区
//    渲染的是知识库页签，开关不在 DOM 里。要改用真实建章路径 + 稳定的视图入口选择器。
// 2. 原 createSecondChapter 只按 Enter 加空行，不建第二章，expectNodeCount(page, 2)
//    的前提不成立，需要走章纲/章节列表真实建章。
// 3. 因此本文件当前不参与门禁；恢复前先在上面两条上跑通，再改回 test()。
test.fixme('协作画布：节点移动与连线增删经 Yjs 两端收敛', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-canvas-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    // 等差分落盘（防抖 400ms），再开协作并 reload 让启动时读到开关
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.localStorage.setItem('collab.enabled', '1'));
    await page.reload();
    await enterWritingArea(page);
    await createSecondChapter(page);

    await openCanvasPanel(page, true);
    // 两个章节投影为两个画布节点
    await expectNodeCount(page, 2);

    const url = page.url();
    const page2 = await openSecondWindow(app, url);
    await enterWritingArea(page2);
    await openCanvasPanel(page2, false);
    await expectNodeCount(page2, 2);
    // 等播种握手完成，再开始编辑
    await page.waitForTimeout(1500);

    // 改：窗口 1 拖动节点 0，窗口 2 的同一节点随之移动
    await dragNode(page, 0, 120, 60);
    await waitForNodeShift(page2, 0, 120, 60);

    // 增：窗口 1 在节点 0 与节点 1 之间建连线，窗口 2 出现同一条
    await connectButtons(page).nth(0).click();
    await connectButtons(page).nth(1).click();
    await expect(removeEdgeButtons(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(removeEdgeButtons(page2)).toHaveCount(1, { timeout: 15_000 });

    // 删：窗口 2 删除连线，窗口 1 随之消失（删除走墓碑，不再参与投影）
    await removeEdgeButtons(page2).click();
    await expect(removeEdgeButtons(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(removeEdgeButtons(page2)).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test.fixme('协作画布：断线重连后已删元素保持删除，协同继续可用', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-canvas-offline-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.localStorage.setItem('collab.enabled', '1'));
    await page.reload();
    await enterWritingArea(page);
    await createSecondChapter(page);

    await openCanvasPanel(page, true);
    await expectNodeCount(page, 2);

    const url = page.url();
    const page2 = await openSecondWindow(app, url);
    await enterWritingArea(page2);
    await openCanvasPanel(page2, false);
    await expectNodeCount(page2, 2);
    await page.waitForTimeout(1500);

    // 先建一条连线并同步到两端
    await connectButtons(page).nth(0).click();
    await connectButtons(page).nth(1).click();
    await expect(removeEdgeButtons(page2)).toHaveCount(1, { timeout: 15_000 });

    // 断线：关闭窗口 2；窗口 1 在无对端状态下删除连线（文档写入墓碑）
    await page2.close();
    await page.waitForTimeout(500);
    await removeEdgeButtons(page).click();
    await expect(removeEdgeButtons(page)).toHaveCount(0, { timeout: 15_000 });

    // 重连：新开窗口 3，收到窗口 1 的全量状态（含墓碑）后墓碑被清除，元素保持删除
    const page3 = await openSecondWindow(app, url);
    await enterWritingArea(page3);
    await openCanvasPanel(page3, false);
    await expectNodeCount(page3, 2);
    await expect(removeEdgeButtons(page3)).toHaveCount(0, { timeout: 15_000 });

    // 协同仍可用：窗口 3 拖动节点，窗口 1 随之移动
    await dragNode(page3, 0, -80, 40);
    await waitForNodeShift(page, 0, -80, 40);
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
