import path from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version: string };

/**
 * 产物体积旁路统计：构建时把每个 chunk 的模块构成（源文件 id + 渲染字节数）
 * 写到 build/bundle-stats.json，供 `npm run bundle:analyze` 输出各 chunk 体积与
 * top 依赖占比。只观察、不改产物；文件写在 build/renderer 之外，不随应用打包。
 */
function bundleStats(): Plugin {
  return {
    name: 'hongyue-bundle-stats',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks: Array<{ fileName: string; modules: Record<string, number> }> = [];
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'chunk') continue;
        const modules: Record<string, number> = {};
        for (const [id, info] of Object.entries(output.modules ?? {})) {
          modules[id] = (info as { renderedLength?: number }).renderedLength ?? 0;
        }
        chunks.push({ fileName, modules });
      }
      writeFileSync(
        path.resolve(__dirname, 'build/bundle-stats.json'),
        JSON.stringify({ version: packageJson.version, chunks }, null, 2),
      );
    },
  };
}

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  publicDir: path.resolve(__dirname, 'src/assets'),
  server: {
    // 默认 5310：避开 Windows 动态保留端口区间（常见 5141–5240 会拦截 5199/5200）；
    // 需要改端口用 HONGYUE_DEV_SERVER_PORT，主进程候选端口同名单源。
    port: Number(process.env.HONGYUE_DEV_SERVER_PORT) || 5310,
    host: '127.0.0.1',
  },
  plugins: [react(), tailwindcss(), bundleStats()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@assets': path.resolve(__dirname, 'src/assets'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'build/renderer'),
    emptyOutDir: true,
    /* 不做 manualChunks 手动分包：手写的 vendor/feature 分包会把 react-dom 的依赖
     * scheduler、use-sync-external-store 等与 react 拆进不同 chunk，形成 chunk 环，
     * 导致先求值的一方拿到 undefined 的 React（生产包白屏）。桌面应用从本地磁盘
     * 加载，分包没有收益，分包正确性交给 Rollup 自动按依赖图切分。 */
  },
});
