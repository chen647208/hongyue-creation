// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import localPlugin from './eslint-rules/no-cross-feature.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const featuresDir = path.join(rootDir, 'src/renderer/features');
const featureNames = fs.existsSync(featuresDir)
  ? fs.readdirSync(featuresDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

/**
 * 跨 feature 边界（design/02 §2）：只准走 core 契约或事件总线，禁止直接 import 对方实现。
 * 规则 error 生效；存量边按「源->目标」冻结为债务（allow 清单），只拦新增边。
 * 债务清单归 docs/design/02-target-architecture.md §2，清完一条删一条，不放宽规则。
 */
const CROSS_FEATURE_DEBT = [];

const featureBoundaryRules = featureNames.map((name) => ({
  files: [`src/renderer/features/${name}/**/*.{ts,tsx}`],
  plugins: { local: localPlugin },
  rules: {
    'local/no-cross-feature': ['error', { allow: CROSS_FEATURE_DEBT }],
  },
}));

export default tseslint.config(
  {
    ignores: [
      'build/**',
      'node_modules/**',
      'dist/**',
      '*.config.js',
      '*.config.ts',
    ],
  },

  // 禁止无用的 eslint-disable（多半是规则改为 error 后遗留），有则报错
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // 运维脚本：Node 全局可用；console 是脚本的合法输出通道
    files: ['scripts/**/*.mjs', 'scripts/**/*.cjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      // .cjs 以 CommonJS 约定运行，require 合法
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        projectService: true,
        tsconfigRootDir: rootDir,
      },
    },
    plugins: { 'react-hooks': reactHooks, 'simple-import-sort': simpleImportSort },
    rules: {
      // 导入排序（自动修复）
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      // 类型纪律
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-empty-object-type': 'warn',

      // 命名约定：标识符按 TS 惯例；属性/对象键不约束（外部数据键名不受控）
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow', trailingUnderscore: 'allow' },
        { selector: 'variable', filter: { regex: '^__', match: true }, format: null },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'], leadingUnderscore: 'allowDouble', trailingUnderscore: 'allow' },
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        { selector: 'parameter', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
        { selector: 'typeProperty', format: null },
        { selector: 'objectLiteralProperty', format: null },
        { selector: 'objectLiteralMethod', format: null },
        { selector: 'classProperty', format: ['camelCase', 'UPPER_CASE'], leadingUnderscore: 'allow' },
        { selector: 'import', format: null },
      ],

      // 异步正确性（类型感知）
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/await-thenable': 'error',
      // 联合/枚举穷尽与弃用 API（类型感知）
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
      '@typescript-eslint/no-deprecated': 'error',

      // 通用纪律（渲染层日志唯一出口是 shared/utils/logger.ts，该文件自带豁免注释）
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-debugger': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      // 禁裸调 localStorage：键归 shared/constants/storageKeys，读写归 storage 服务
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='localStorage']",
          message: '禁止直接使用 localStorage：键见 @shared/constants/storageKeys，读写走存储服务',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: '禁止 Math.random 生成 id：走 @core/entities 的 uuidv7',
        },
      ],

      // React Hooks（正确性关键）
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // 主进程：允许 console（Electron 主进程日志），其余同样严格
  {
    files: ['src/main/**/*.ts'],
    ignores: [],
    plugins: {},
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // 平台无关内核（src/core）：架构边界 —— 只依赖 shared 纯类型，禁止反向依赖渲染层/主进程
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/*'], message: 'core 不得依赖渲染层（@/ 别名）' },
            { group: ['@assets/*'], message: 'core 不得依赖资源层' },
            { group: ['**/renderer/**', '**/main/**'], message: 'core 不得依赖渲染层/主进程实现' },
            { group: ['electron', 'electron/*'], message: 'core 不得依赖 Electron' },
            { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'core 不得依赖 React/DOM' },
          ],
        },
      ],
    },
  },

  // localStorage 唯一合法直调点（封装本体）
  {
    files: ['src/renderer/shared/services/localStore.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // 重试抖动与 k-means 随机初始质心使用 Math.random（非 id 生成），与 id 规则无关
  {
    files: ['src/main/ai/retry.ts', 'src/renderer/shared/services/knowledge/embeddingService.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // 测试文件：放宽部分规则（断言、console、any 在测试中是惯用写法）
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },

  // feature 禁直接依赖 repository 内部实现（design/02 §2），只准走 store 或注入 API。
  // 存量 5 文件冻结在 ignores（各归设计文档），清一件删一件，不放宽规则。
  {
    files: ['src/renderer/features/**/*.{ts,tsx}'],
    ignores: [
      'src/renderer/features/knowledge/StepKnowledgeEnhanced.tsx',
      'src/renderer/features/settings/components/StorageSettingsPanel.tsx',
      'src/renderer/features/settings/SettingsModal.tsx',
      'src/renderer/features/writing/components/ChapterHistoryModal.tsx',
      'src/renderer/features/writing/services/summaryExtractionService.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/shared/services/repository',
                '**/shared/services/repository/**',
                '@/shared/services/repository',
                '@/shared/services/repository/**',
              ],
              message: 'feature 禁止直接依赖 repository 内部实现；走 store 或注入的 API（design/02 §2）',
            },
          ],
        },
      ],
    },
  },

  // 无障碍静态门禁（渲染层 JSX）
  {
    files: ['src/renderer/**/*.tsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      // 自定义可点元素（role=button + tabIndex + 键盘处理）由项目约定承担，避免误报
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      // 搜索框/查找栏/重命名输入聚焦是预期交互，Radix 亦自行管理初始焦点
      'jsx-a11y/no-autofocus': 'off',
    },
  },

  // 跨 feature 边界（error，存量边冻结在 CROSS_FEATURE_DEBT）
  ...featureBoundaryRules,
);

