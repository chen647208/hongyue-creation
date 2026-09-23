import { defineConfig } from '@playwright/test';

/**
 * E2E：Electron 启动冒烟 + 工作台主流程断言（无 AI Key 可跑）。
 * webServer 起 vite（与 electron:dev 同端口），用例再起 electron .（开发模式）。
 * 不下载 Playwright 浏览器：只用仓库自带 electron 二进制（见 CI 的 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD）。
 *
 * project：
 * - electron：全部 Electron 冒烟与交互用例。
 * - mobile-pwa：只跑 e2e/pwa.spec.ts，需要真实 Chromium（注册门在 Electron 下恒为 false，
 *   离线壳这条路径只有真实浏览器能验）。仓库约定不下载 Playwright 浏览器，故该项目默认不挂：
 *   置 PWA_E2E=1 且先 `npx playwright install chromium` 才参与运行。
 */
const PWA_E2E = process.env.PWA_E2E === '1';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 120_000,
  reporter: 'line',
  // flaky 治理：CI 重试 2 次，首败留 trace
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
    // 视觉基线按平台存放（跨 OS 渲染有差异）
    snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{testFilePath}/{arg}{ext}',
  },
  webServer: {
    command: 'npx vite --port 5310 --strictPort',
    port: 5310,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'electron',
      testIgnore: /pwa\.spec\.ts/,
    },
    ...(PWA_E2E
      ? [
          {
            name: 'mobile-pwa',
            testMatch: /pwa\.spec\.ts/,
            use: {
              browserName: 'chromium' as const,
              // 手机宽度 + 触控：流式重排与 44px 命中区按这档视口验收。
              viewport: { width: 390, height: 844 },
              hasTouch: true,
              locale: 'zh-CN',
            },
          },
        ]
      : []),
  ],
});
