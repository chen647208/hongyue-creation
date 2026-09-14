import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,test, type Page } from '@playwright/test';
import { cleanupUserDataDir, createBook, launchApp } from './helpers';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

interface AxeNode { target: unknown; html?: string; failureSummary?: string }
interface AxeViolation { id: string; impact?: string | null; help: string; nodes: AxeNode[] }

/** 跑 axe（wcag2a/aa）并只返回 serious/critical 违规。 */
async function blockingViolations(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: axeSource });
  const violations = (await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    return result.violations;
  })) as AxeViolation[];
  return violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
}

const summary = (label: string, violations: AxeViolation[]) =>
  violations.map((v) => ({
    page: label,
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    help: v.help,
    targets: v.nodes.map((n) => n.target),
    html: v.nodes.map((n) => n.html),
    detail: v.nodes.map((n) => n.failureSummary),
  }));

/**
 * 面板欠账棘轮：每个主要面板登记「规则 id → 允许的节点上限」，
 * 只减不增。未登记的规则视为零容忍。出现新违规时断言失败并在
 * 报错里带出选择器与 failureSummary，便于定位。
 */
type PanelDebt = Record<string, number>;

/** 结构页（大纲/细纲编辑器）既有欠账。 */
const STRUCTURE_KNOWN_DEBT: PanelDebt = {
  'aria-input-field-name': 1,
  'button-name': 2,
  'color-contrast': 2,
  'scrollable-region-focusable': 1,
};

/** 设置面板既有欠账（测于默认的模型提供商页签，各页签共用为上界）。 */
const SETTINGS_KNOWN_DEBT: PanelDebt = {
  'aria-toggle-field-name': 1,
  'button-name': 2,
  'color-contrast': 5,
  label: 1,
};

/** 设置页签标签（中英双语，供键盘遍历与逐页审计）。 */
const SETTINGS_TABS: Array<{ zh: string; en: string }> = [
  { zh: '通用', en: 'General' },
  { zh: '模型提供商', en: 'Model Providers' },
  { zh: '向量模型', en: 'Embedding Models' },
  { zh: '提示词库', en: 'Prompt Library' },
  { zh: '卡片提示词', en: 'Card Prompts' },
  { zh: '一致性检查模板', en: 'Consistency Templates' },
  { zh: '配置教程', en: 'Setup Guide' },
  { zh: '数据存储', en: 'Data Storage' },
  { zh: '插件', en: 'Plugins' },
  { zh: '同步传输', en: 'Sync Transport' },
];

/** 分区快捷键顺序（App.tsx SECTION_ORDER）。 */
const SECTION_KEYS = ['Control+1', 'Control+2', 'Control+3', 'Control+4', 'Control+5'] as const;

const PANEL_DEBT: Record<string, PanelDebt> = {
  bookshelf: {},
  workspace: {},
  world: {},
  'world.views': {},
  'world.timeline': {},
  characters: {},
  'structure.outline': STRUCTURE_KNOWN_DEBT,
  'structure.chapters': STRUCTURE_KNOWN_DEBT,
  writing: {},
  ...Object.fromEntries(SETTINGS_TABS.map((tab) => [`settings.${tab.zh}`, SETTINGS_KNOWN_DEBT])),
};

/** 审计当前页面：只允许基线内的欠账，新增任何 serious/critical 即失败。 */
async function expectNoNewDebt(page: Page, label: string): Promise<void> {
  const violations = await blockingViolations(page);
  const debt = PANEL_DEBT[label] ?? {};
  const regressions = violations.filter((v) => (debt[v.id] ?? 0) < v.nodes.length);
  expect(summary(label, regressions), `${label} 出现新的 axe serious/critical 问题`).toEqual([]);
}

test('书架/工作台各分区通过 axe 棘轮审计', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-a11y-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await expectNoNewDebt(page, 'bookshelf');

    await createBook(page);
    await expectNoNewDebt(page, 'workspace');

    // Ctrl+2 世界
    await page.keyboard.press('Control+2');
    await page.waitForTimeout(500);
    await expectNoNewDebt(page, 'world');

    // 世界子面板：数据视图与双轴时间线
    await page.getByRole('button', { name: /数据视图|Data Views/ }).first().click();
    await page.waitForTimeout(500);
    await expectNoNewDebt(page, 'world.views');
    await page.getByRole('button', { name: /双轴时间线|Dual-Axis Timeline/ }).first().click();
    await page.waitForTimeout(500);
    await expectNoNewDebt(page, 'world.timeline');

    // Ctrl+3 角色
    await page.keyboard.press('Control+3');
    await page.waitForTimeout(500);
    await expectNoNewDebt(page, 'characters');

    // Ctrl+4 结构：大纲子页 + 细纲子页
    await page.keyboard.press('Control+4');
    await page.waitForTimeout(500);
    await expectNoNewDebt(page, 'structure.outline');
    await page.getByRole('button', { name: /^细纲$|^Chapters$/ }).first().click();
    await page.waitForTimeout(500);
    await expectNoNewDebt(page, 'structure.chapters');

    // Ctrl+5 写作
    await page.keyboard.press('Control+5');
    await page.waitForTimeout(500);
    await expectNoNewDebt(page, 'writing');
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

test('设置各页签通过 axe 棘轮审计', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-a11y-settings-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await createBook(page);
    await page.keyboard.press('Control+1');
    await page.getByRole('button', { name: /^设置$|^Settings$/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    for (const tab of SETTINGS_TABS) {
      await dialog.getByRole('button', { name: new RegExp(`^(${tab.zh}|${tab.en})$`) }).first().click();
      await page.waitForTimeout(400);
      await expectNoNewDebt(page, `settings.${tab.zh}`);
    }
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

/** 手机宽度（390×844）：底部导航与流式重排界面要求零 serious/critical。 */
test('手机宽度的书架/工作台通过 axe 审计', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-a11y-mobile-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    const violations = [...summary('bookshelf-mobile', await blockingViolations(page))];

    await createBook(page);
    violations.push(...summary('workspace-mobile', await blockingViolations(page)));

    expect(violations, '手机宽度书架/工作台出现 axe serious/critical 问题').toEqual([]);
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});

/**
 * 键盘全链路（11.4）：建书 → 进工作台 → 切分区 → 开设置各页签 → 开关全局对话框，
 * 全部通过聚焦 + Enter/Space/Esc/Ctrl 快捷键完成，不依赖鼠标。
 */
test('键盘可完成建书→工作台→分区→设置→弹层全链路', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-a11y-keyboard-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    // 首启向导：键盘跳过
    const skip = page.getByRole('button', { name: /跳过|Skip/ });
    if (await skip.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await skip.focus();
      await page.keyboard.press('Enter');
    }

    // 建书：聚焦「新建书籍」按钮并回车打开模态
    const newBook = page.getByRole('button', { name: /新建书籍|New Book/ }).first();
    await newBook.focus();
    await page.keyboard.press('Enter');

    // 表单标签关联：标题输入框可被键盘聚焦，输入后回车提交
    const title = page.getByLabel(/书籍标题|Book Title|Title/).first();
    await expect(title).toBeVisible({ timeout: 15_000 });
    await title.focus();
    await title.fill('键盘路径测试书');
    await page.keyboard.press('Enter');

    // 手写豁免（无模型时）
    const handwrite = page.getByRole('button', { name: /先手写看看|Write by hand/ });
    if (await handwrite.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await handwrite.focus();
      await page.keyboard.press('Enter');
    }
    await expect(page.getByPlaceholder(/输入你的初始灵感|Enter your initial inspiration/)).toBeVisible({ timeout: 30_000 });

    // 分区：Ctrl+2..5 切到其余分区，再回 Ctrl+1（设置入口需非写作分区）
    for (const key of SECTION_KEYS.slice(1)) {
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
    }
    await page.keyboard.press('Control+1');
    await page.waitForTimeout(300);

    // 设置：聚焦左侧「设置」并回车
    await page.getByRole('button', { name: /^设置$|^Settings$/ }).first().focus();
    await page.keyboard.press('Enter');
    const settingsDialog = page.getByRole('dialog').first();
    await expect(settingsDialog).toBeVisible({ timeout: 30_000 });

    // 各页签：聚焦 + 回车逐个切换
    for (const tab of SETTINGS_TABS) {
      await settingsDialog
        .getByRole('button', { name: new RegExp(`^(${tab.zh}|${tab.en})$`) })
        .first()
        .focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
    }

    // 全局命令面板：Ctrl+K 打开，Esc 关闭后焦点回到设置弹层
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog').filter({ hasText: /命令面板|Command palette/ });
    await expect(palette).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden({ timeout: 10_000 });

    // 设置弹层：Esc 关闭
    await page.keyboard.press('Escape');
    await expect(settingsDialog).toBeHidden({ timeout: 10_000 });
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
