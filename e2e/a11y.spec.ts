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
 * 无障碍审计（棘轮门禁）：书架与工作台要求零 serious/critical；
 * 设置面板存在既有无障碍欠账（见 docs/design/26 测试/无障碍），
 * 以基线棘轮收口——只允许已记录的类别与数量，任何新增即失败。
 */
const SETTINGS_KNOWN_DEBT: Record<string, number> = {
  'aria-toggle-field-name': 1,
  'button-name': 2,
  'color-contrast': 5,
  label: 1,
};

/** 结构页（大纲/细纲编辑器）既有欠账，以基线棘轮收口。 */
const STRUCTURE_KNOWN_DEBT: Record<string, number> = {
  'aria-input-field-name': 1,
  'button-name': 2,
  'color-contrast': 2,
  'scrollable-region-focusable': 1,
};

test('书架/工作台/设置通过 axe 棘轮审计', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'hongyue-a11y-'));
  const { app, page } = await launchApp(userDataDir);
  try {
    const strict = [
      ...summary('bookshelf', await blockingViolations(page)),
    ];

    await createBook(page);
    strict.push(...summary('workspace', await blockingViolations(page)));

    await page.keyboard.press('Control+4');
    await page.waitForTimeout(500);
    const structure = await blockingViolations(page);
    const structureRegressions = structure.filter((v) => (STRUCTURE_KNOWN_DEBT[v.id] ?? 0) < v.nodes.length);
    expect(summary('structure', structureRegressions), '结构页出现新的 axe serious/critical 问题').toEqual([]);

    await page.keyboard.press('Control+2');
    await page.waitForTimeout(500);
    strict.push(...summary('world', await blockingViolations(page)));

    expect(strict, '书架/工作台/世界出现 axe serious/critical 问题').toEqual([]);

    await page.getByRole('button', { name: /^设置$|^Settings$/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
    const settings = await blockingViolations(page);
    const regressions = settings.filter((v) => (SETTINGS_KNOWN_DEBT[v.id] ?? 0) < v.nodes.length);
    expect(summary('settings', regressions), '设置面板出现新的 axe serious/critical 问题').toEqual([]);
  } finally {
    await app.close();
    cleanupUserDataDir(userDataDir);
  }
});
