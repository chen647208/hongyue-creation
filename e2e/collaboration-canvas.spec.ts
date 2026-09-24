import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { cleanupUserDataDir, createBook, enterWritingArea, launchApp } from './helpers';

/**
 * 画布协作双端 e2e：画布节点位置经同一份 Y.Doc 两端收敛。
 * 起法与 e2e/collaboration.spec.ts 一致：临时用户数据目录、--lang=zh-CN、开协作后 reload，
 * 第二窗口用同 preload 同 devUrl 新建（同 origin 共享 localStorage 与 BroadcastChannel）。
 *
 * 画布节点投影规则：buildEntityView 把每个章节投成一行，projectCanvas 再把每行投成一个节点；
 * 空白书只有章节行，因此「两个章节」即「两个画布节点」（DOM 序即行序）。
 *
 * 连线（增）与删连线（删）相关用例为 fixme：连线在存档的视图配置里活不过一次往返，
 * 任何经 parseViewLayout 读回的布局都把连线判「端点节点不存在」全量丢弃，
 * 因此 UI 上永远画不出持久连线，详见两个 fixme 用例注释中的根因、位置与复现口径。
 */

/** 打开世界分区的数据视图面板并切到画布形态；needSave 为首个窗口保存视图（之后编辑才落库并可同步）。 */
async function openCanvasPanel(page: Page, needSave: boolean): Promise<void> {
  // Ctrl+2 只受 view === 'workspace' 门控：从写作/结构分区热键切世界分区后，等知识库分区
  // （React.lazy 分包）渲染出「数据视图」开关卡再点；开关在世界分区常驻，与之前所在分区无关。
  await page.keyboard.press('Control+2');
  const dataViewToggle = page.getByRole('button', { name: /数据视图/ }).first();
  try {
    await expect(dataViewToggle).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    const names = await page
      .getByRole('button')
      .evaluateAll((els) =>
        els.map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()).filter(Boolean),
      );
    throw new Error(
      `「数据视图」开关未出现；当前页面按钮清单：${names.join(' | ')}（原错误：${
        error instanceof Error ? error.message : String(error)
      }）`,
      { cause: error },
    );
  }
  await dataViewToggle.click();
  const saveView = page.getByRole('button', { name: '保存视图' });
  await expect(saveView).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '画布', exact: true }).click();
  if (needSave) await saveView.click();
}

/** 新建第二个章节：结构分区（Ctrl+4）细纲子页的「+ 新建章节」按钮真实追加 Chapter，比编辑器内连按 Enter 稳定。 */
async function createSecondChapter(page: Page): Promise<void> {
  await page.keyboard.press('Control+4');
  const chaptersTab = page.getByRole('button', { name: /^细纲$/ }).first();
  await expect(chaptersTab).toBeVisible({ timeout: 30_000 });
  await chaptersTab.click();
  const addChapter = page.getByRole('button', { name: /^\+ 新建章节$/ }).first();
  await expect(addChapter).toBeVisible({ timeout: 30_000 });
  await addChapter.click();
  // 章节列表计数 1 → 2：确认真的追加了章节（而不是只在当前章加空行）
  await expect(page.getByText('章节列表预览 (2)')).toBeVisible({ timeout: 15_000 });
}

/**
 * 第二/第三窗口进入工作台：reload 与新窗口都落在书籍库，点开书即进工作台（view = workspace，
 * Ctrl+2 才被受理）；未配置模型时世界分区同样被「先手写看看」整体挡住，先点掉它。
 * 与 enterWritingArea 的差别：这两个窗口的书已有章节，写作区不再出现「新建第一章」，
 * 也不需要编辑器，直接落到世界分区。
 */
async function enterWorkspaceFromBookshelf(page: Page): Promise<void> {
  const bookshelfToolbar = page.getByRole('button', { name: /新建书籍|New Book/ }).first();
  if (await bookshelfToolbar.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await page
      .locator('div[role="button"][tabindex="0"]')
      .filter({ hasText: /新小说|New Novel|E2E测试书/ })
      .first()
      .click({ timeout: 15_000 });
  }
  const handwrite = page.getByRole('button', { name: /先手写看看|Write by hand/ }).first();
  await expect(handwrite).toBeVisible({ timeout: 30_000 });
  await handwrite.click({ timeout: 10_000 });
  await expect(handwrite).toBeHidden({ timeout: 10_000 });
  // 写作区常驻「创作参考面板」侧栏会占宽并把画布挤出可视区，先收起（Ctrl+J 只是全局助手开关，
  // 对常驻侧栏无效；快捷键写作区也无对应项，故点击其标题栏的收起按钮）。
  const collapseSidebar = page.getByRole('button', { name: /收起参考面板|Collapse reference panel/ }).first();
  if (await collapseSidebar.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await collapseSidebar.click();
  }
}

/** 画布节点：绝对定位的 div（role=button、可聚焦）；DOM 序即投影序（行序）。 */
const canvasNodes = (page: Page) => page.locator('div[role="button"][tabindex="0"]');
// 节点/连线按钮的 aria-label 由 ViewCanvas 用 ASCII 冒号加空格拼接（`${label}: ${nodeLabel}`），
// 节点标签内部才是全角冒号（`{{kind}}：{{title}}`），故前缀匹配只认 ASCII 冒号。
const connectButtons = (page: Page) => page.getByRole('button', { name: /^连线: / });
const removeEdgeButtons = (page: Page) => page.getByRole('button', { name: /^删除连线: / });

/**
 * 键盘微调节点：聚焦目标节点后按方向键，一次只按一格并等坐标落地。
 *
 * 不走鼠标拖拽：mousedown 与 mouseup 命中同一节点时浏览器仍会补发 click，触发节点的
 * onSelectNode→跳转写作区，世界分区与画布随即卸载，后续断言全部落空。键盘通道不产生
 * click，走的是同一条 onMoveNode 写回路径，协同语义等价。
 *
 * 必须逐格等待：节点的写回是「异步 saveView 落库 → store reload → 重渲染」，连按多格时
 * 后续按键的处理器仍拿着旧 layout 闭包，每格都从原位置重算并互相覆盖，最终只剩最后一格
 * 的位移。等前一格的坐标真正写进 style 后再按下一格，闭包才是新的。
 */
const CANVAS_KEYBOARD_STEP = 16;

async function nudgeNode(page: Page, index: number, dx: number, dy: number): Promise<void> {
  const node = canvasNodes(page).nth(index);
  await node.scrollIntoViewIfNeeded();
  await node.focus();
  // 焦点必须真的落在节点上：焦点若还留在别处，方向键会被其它组件吃掉而节点不动。
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  const nodeLabelText = await node.getAttribute('aria-label');
  if (focused !== nodeLabelText) {
    throw new Error(`节点 ${index} 未取得焦点（期望「${nodeLabelText ?? ''}」，当前「${focused}」）`);
  }
  const steps = [
    ...Array.from({ length: Math.abs(dy) }, () => ({ key: dy >= 0 ? 'ArrowDown' : 'ArrowUp', stepY: dy >= 0 ? CANVAS_KEYBOARD_STEP : -CANVAS_KEYBOARD_STEP, stepX: 0 })),
    ...Array.from({ length: Math.abs(dx) }, () => ({ key: dx >= 0 ? 'ArrowRight' : 'ArrowLeft', stepY: 0, stepX: dx >= 0 ? CANVAS_KEYBOARD_STEP : -CANVAS_KEYBOARD_STEP })),
  ];
  for (const step of steps) {
    const before = await nodeCanvasPoint(page, index);
    await page.keyboard.press(step.key);
    await waitForNodeAt(page, index, { x: before.x + step.stepX, y: before.y + step.stepY });
  }
}

/** 节点画布坐标（style.left/top 的数值）：与页面滚动无关，用于两端收敛比对。 */
async function nodeCanvasPoint(page: Page, index: number): Promise<{ x: number; y: number }> {
  return page.evaluate((i) => {
    const el = document.querySelectorAll<HTMLElement>('div[role="button"][tabindex="0"]')[i];
    if (!el) throw new Error(`画布节点 ${i} 不在 DOM 中`);
    return { x: Number.parseFloat(el.style.left), y: Number.parseFloat(el.style.top) };
  }, index);
}

/** 轮询等待节点到达指定画布坐标（容差 2px，规避取整）。 */
async function waitForNodeAt(page: Page, index: number, point: { x: number; y: number }): Promise<void> {
  const deadline = Date.now() + 20_000;
  let last: { x: number; y: number } | undefined;
  while (Date.now() < deadline) {
    try {
      last = await nodeCanvasPoint(page, index);
    } catch {
      // 节点瞬时不在 DOM（重渲染中）：继续等
    }
    if (last && Math.abs(last.x - point.x) <= 2 && Math.abs(last.y - point.y) <= 2) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`画布节点 ${index} 未到达 (${point.x}, ${point.y})，当前 (${last?.x}, ${last?.y})`);
}

async function expectNodeCount(page: Page, count: number): Promise<void> {
  await expect(canvasNodes(page)).toHaveCount(count, { timeout: 15_000 });
}

/** 收集渲染进程控制台与未捕获异常：失败取证用（定位画布为何消失）。 */
function collectPageLogs(page: Page): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));
  return logs;
}

/** 失败取证：画布节点数、主区域文本、渲染进程日志。 */
async function dumpCanvasState(page: Page, logs: readonly string[]): Promise<string> {
  const nodes = await canvasNodes(page)
    .count()
    .catch(() => -1);
  const main = await page
    .locator('main')
    .innerText()
    .catch(() => '<无 main>');
  return `画布节点数=${nodes}；主区域文本：${main.replace(/\s+/g, ' ').slice(0, 1200)}；日志尾部：${logs.slice(-25).join(' ‖ ')}`;
}

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

/** 双端画布协作的公共起法：建书 → 开协作 reload → 建两章 → 窗口 1 开画布并保存视图。 */
async function setupCanvasPair(app: import('@playwright/test').ElectronApplication, page: Page): Promise<Page> {
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
  const peer = await openSecondWindow(app, url);
  await enterWorkspaceFromBookshelf(peer);
  await openCanvasPanel(peer, false);
  await expectNodeCount(peer, 2);
  // 等播种握手完成，再开始编辑
  await page.waitForTimeout(1500);
  return peer;
}

test('协作画布：节点位置经 Yjs 两端双向收敛', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-canvas-'));
  const { app, page } = await launchApp(userDataDir);
  const logs = collectPageLogs(page);
  let page2: Page | undefined;
  const logs2: string[] = [];
  try {
    page2 = await setupCanvasPair(app, page);
    const peerLogs = collectPageLogs(page2);
    logs2.push(...peerLogs);

    // 窗口 1 → 窗口 2：窗口 1 键盘微调节点 0（每格等落地），窗口 2 的同名节点收敛到同一坐标
    await nudgeNode(page, 0, 2, 3);
    const movedByWindow1 = await nodeCanvasPoint(page, 0);
    await waitForNodeAt(page2, 0, movedByWindow1);

    // 窗口 2 → 窗口 1：反向再收敛一次，确认两端都是平等的写入方（不是单向镜像）
    await nudgeNode(page2, 0, -1, -2);
    const movedByWindow2 = await nodeCanvasPoint(page2, 0);
    await waitForNodeAt(page, 0, movedByWindow2);

    // 收敛不等于只剩一个节点：两端应仍是两个章节节点
    await expectNodeCount(page, 2);
    await expectNodeCount(page2, 2);
  } catch (error) {
    const state = await dumpCanvasState(page, logs);
    const state2 = await dumpCanvasState(page2 ?? page, logs2);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n[窗口1] ${state}\n[窗口2] ${state2}`, {
      cause: error,
    });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

/** 连线与墓碑 e2e：两条都真实跑通（此前无法通过的根因是布局解析丢弃投影行连线，已修）。 */
test('协作画布：连线增删经 Yjs 两端收敛', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-canvas-'));
  const { app, page } = await launchApp(userDataDir);
  const logs = collectPageLogs(page);
  let page2: Page | undefined;
  const logs2: string[] = [];
  try {
    page2 = await setupCanvasPair(app, page);
    logs2.push(...collectPageLogs(page2));

    // 增：窗口 1 在节点 0 与节点 1 之间建连线，窗口 2 出现同一条。
    // 两次点击之间要等「已进入连线态」落定：连接源是 React state，第一次点击后若 state
    // 尚未提交，第二次点击只会把连接源改成节点 1，连线根本建不出来。
    await connectButtons(page).nth(0).click();
    await expect(connectButtons(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
    await connectButtons(page).nth(1).click();
    // 连线态随之退出（aria-pressed 回落），这才是 onConnect 已执行、Edge 已写入的信号
    await expect(connectButtons(page).nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(removeEdgeButtons(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(removeEdgeButtons(page2)).toHaveCount(1, { timeout: 15_000 });

    // 删：窗口 2 删除连线，窗口 1 随之消失（删除走墓碑，不再参与投影）
    await removeEdgeButtons(page2).click();
    await expect(removeEdgeButtons(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(removeEdgeButtons(page2)).toHaveCount(0, { timeout: 15_000 });
  } catch (error) {
    const state = await dumpCanvasState(page, logs);
    const state2 = await dumpCanvasState(page2 ?? page, logs2);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n[窗口1] ${state}\n[窗口2] ${state2}`, {
      cause: error,
    });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

/**
 * fixme：断线重连后已删元素保持删除，协同继续可用。
 *
 * 与上一条同因：墓碑删除的观测量就是「删除连线」按钮从两端消失，而连线本身在
 * parseCanvasLayout 的往返里被判失链丢弃（根因与复现口径见上一条注释），
 * 删除动作无 UI 可验。修好连线的存档往返后本用例可恢复执行。
 * 其中「重连后协同仍可用」这半步（新窗口 3 看到两个节点、键盘微调节点后窗口 1 收敛）
 * 与墓碑无关，在当前缺陷下即可跑通；连线问题修复后可整体放开。
 */
test('协作画布：断线重连后已删元素保持删除，协同继续可用', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-e2e-canvas-offline-'));
  const { app, page } = await launchApp(userDataDir);
  const logs = collectPageLogs(page);
  let page2: Page | undefined;
  const logs2: string[] = [];
  try {
    page2 = await setupCanvasPair(app, page);
    logs2.push(...collectPageLogs(page2));

    // 先建一条连线并同步到两端（两次点击之间等「已进入连线态」落定，理由同增/录用例）
    await connectButtons(page).nth(0).click();
    await expect(connectButtons(page).nth(0)).toHaveAttribute('aria-pressed', 'true');
    await connectButtons(page).nth(1).click();
    await expect(connectButtons(page).nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(removeEdgeButtons(page2)).toHaveCount(1, { timeout: 15_000 });

    // 断线：关闭窗口 2；窗口 1 在无对端状态下删除连线（文档写入墓碑）
    await page2.close();
    await page.waitForTimeout(500);
    await removeEdgeButtons(page).click();
    await expect(removeEdgeButtons(page)).toHaveCount(0, { timeout: 15_000 });

    // 重连：新开窗口 3，收到窗口 1 的全量状态（含墓碑）后墓碑被清除，元素保持删除
    const page3 = await openSecondWindow(app, page.url());
    await enterWorkspaceFromBookshelf(page3);
    await openCanvasPanel(page3, false);
    await expectNodeCount(page3, 2);
    await expect(removeEdgeButtons(page3)).toHaveCount(0, { timeout: 15_000 });

    // 协同仍可用：窗口 3 键盘微调节点，窗口 1 收敛到同一坐标
    await nudgeNode(page3, 0, 2, 2);
    const moved = await nodeCanvasPoint(page3, 0);
    await waitForNodeAt(page, 0, moved);
  } catch (error) {
    const state = await dumpCanvasState(page, logs);
    const state2 = await dumpCanvasState(page2 ?? page, logs2);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n[窗口1] ${state}\n[窗口2] ${state2}`, {
      cause: error,
    });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
