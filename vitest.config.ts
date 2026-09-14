import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * 单元测试配置：node 环境，测试与被测代码同目录（__tests__）。
 * 涉及 window/electronAPI 的服务测试通过显式 mock 完成。
 * resolve.alias 与 vite.config.ts 保持一致，使 @/ 等别名在测试中同样可解析。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src/renderer'),
      '@core': path.resolve(rootDir, 'src/core'),
      '@shared': path.resolve(rootDir, 'src/shared'),
      '@assets': path.resolve(rootDir, 'src/assets'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    globals: false,
    setupFiles: [path.resolve(rootDir, 'src/renderer/i18n/vitest-setup.ts')],
    // 覆盖率强约束（分层锁线，低于即测试失败；只允许随测试补充上调）：
    // - src/core 领域层高标准（当前 86.84/74.3/86.35/90.63）
    // - src/main 主进程锁当前基线（Electron 边界代码覆盖成本高）
    // - src/renderer 锁当前基线（UI 组件归 E2E 测试覆盖）
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.{ts,tsx}', 'src/main/mcp/**'],
      thresholds: {
        'src/core/**': { statements: 85, branches: 73, functions: 85, lines: 89 },
        'src/main/**': { statements: 50, branches: 46, functions: 38, lines: 52 },
        'src/renderer/**': { statements: 23, branches: 17, functions: 19, lines: 23 },
      },
    },
  },
});
