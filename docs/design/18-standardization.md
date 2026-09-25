# 18 规范化重构：组件化、代码标准、插件化

本文件是"消除自由发挥、对齐工业化打法"的总案，配套 `17-industry-gaps.md`（能力缺口）。
分三条线，每条给现状、目标、批次与验收。逐批实现、独立提交、跑 `npm run verify`。

## 一、现状（审计结论）

- **UI**：`shared/ui` 26 个组件中 8 个从未使用；卡片/模态/页签/复选框/进度条/表单标签等
  被 40+ 处手写替代；约 130 处任意值 Tailwind 绕过令牌；`z-[10001]` 等魔法层级散落；
  `.custom-scrollbar` 是空类却被 43 处引用。
- **代码**：37 个文件 >400 行（`WritingEditor.tsx` 1509、`GlobalAssistant.tsx` 1169）；
  `window.electronAPI` 直连 120 处、`localStorage` 43 处且 key 为散落字面量；id 生成 31 处
  `Math.random`（含废弃 `substr`），而仓库已有 `uuidv7`；日期/截断/退避等工具重复多套；
  同名类型跨层分叉（`ConsistencyCheckResult`/`VectorDocument`/`ChatMessage`）。
- **插件化**：manifest 校验、PluginHost、EventBus、注册表等"骨架层"已具备；
  但 `bootstrapPlugins` 从不激活（贡献点永不生效）、类型注册表无 UI 消费、build profile
  注册表无消费方、15 个 feature 与应用壳全部硬连线、UI 槽位/命令注册表未实现。

## 二、批次规划

### 批次 A（已落地）

- 主题令牌改 Tailwind v4 官方写法（`@theme inline` + `:root`/`.dark`），修回归。
- 插件发现后自动 `activateAll()`（贡献点生效），补测试。

### 批次 B：id 与存储键收敛（低风险、全仓机械替换）

1. 所有运行期 id 生成统一走 `@core/entities` 的 `uuidv7`，删除 31 处 `Math.random` 与 `substr`；
   保留业务前缀（如 `snap_`/`sess_`）。
2. `shared/constants/storageKeys.ts` 收敛全部 localStorage key；裸调改经封装。

### 批次 C：共享工具与类型单源

3. `shared/utils`：`format`（日期/数字，固定 locale 策略）、`text`（`truncate`）、
   `async`（`debounce/throttle`）、`json`（`safeParse`）、`retry`（复用主进程退避设计）。
4. 同名类型消歧：`ConsistencyCheckResult`（world 版改名）、`VectorDocument`/`TokenUsage`/
   `ChatMessage` 主渲染共用一份。

### 批次 D：UI 组件化（P0 → P1）

5. 新增基础件：`ModalShell(+Header/Footer，size 变体)`、`FieldLabel/FormField`、
   `IconButton(tone/active)`、`LoadingState`、`Alert/Callout`；`Card` 增 `interactive/selected`。
6. 用现成共享件替换手写：`Progress`（4 处）、`Checkbox/CheckboxRow`（20 处）、
   `Tabs`（5 处）、`Select`（1 处）、`Badge`（若干）。
7. 删除无落地计划的死组件（Accordion/Popover/ScrollArea/Skeleton）与 `shared/ui/index.ts`；
   `.custom-scrollbar` 清理；`z-index` 与模态尺寸令牌化；修 `Markdown.tsx` 的 `text-[0.9em]`。
8. 删除确认统一到 `dialogService.confirm`，移除 11 处组件内两段式确认状态机。

### 批次 E：巨型文件拆分（P0）

9. `WritingEditor.tsx` 抽 hook：`useChapterSnapshots/useFindReplace/useChapterExport/
   useChapterGeneration/useChapterMutations`。
10. `GlobalAssistant.tsx` 抽 `useAssistantChat/useAssistantCards/useModelSelection`。
11. `WorldViewGraph` 抽 `graphLayout.ts`（纯算法可测）；`storage.ts` 拆迁移/配置；
    `StepKnowledgeEnhanced`/`StepChapterOutline` 拆面板。

以上 hook 与 `graphLayout`/`storageMigrations` 已落地；两个 Step 面板另抽出
`useChapterOutlineGeneration`/`useKnowledgeIndex`/`chapterOutline`/`knowledgeSearch`，进一步的面板级 JSX 拆分按需进行。

### 批次 F：插件化通电（P0 → P1）

12. `ai.request` 门常态化：minimal 档在 `aiRuntime` 注册，所有 AI 出口经统一门
    （`gatewayClient`/`AIService`），修 6 条绕过路径。
13. 类型注册表接 UI：`bridge.ts` 的写死 `COLLECTIONS`/分派改为读注册表，未知类型落
    `project.extensions[type]`，让插件模板端到端可见。
14. `BuildProfileRegistry` 接入导出弹窗；`registerRenderer/Transformer` 命名空间化 + Disposable，
    并在 `pluginService` 装配 `contributes.renderers`。
15. 15 个 feature 契约化：分区/导航/设置 tab 由 feature 清单驱动，`App.tsx`/`WorkspaceNav`
    零改动即可增 feature；落地 `SlotRegistry`（nav/sidebar/editor-toolbar/status-bar/settings-tab）
    与命令注册表。

## 三、验收标准

- 每批 `npm run verify` 全绿；UI/运行时改动跑 `npm run test:e2e`；打包冒烟 `test:e2e:packaged`。
- 组件化：手写类串（如 `rounded-lg border border-border bg-card`、危险图标按钮）替换后 grep 清零；
  未使用共享组件清零或删除。
- 一致性：`Math.random` id、裸 `localStorage` 字面量、`as unknown as` 非边界用法逐批下降；
  同名类型无跨层分叉。
- 插件化：禁用全部插件后纯写作可用；加载示例插件后技能/类型在 UI 可见并可往返；
  minimal 档所有 AI 入口被统一拒绝；新增 feature 不改应用壳。

## 六、视觉回归

`e2e/visual.spec.ts` 截取工作台左侧导航栏、命令面板、写作区空态，基线按平台存
`e2e/visual.spec.ts-snapshots/…-{platform}.png`（截图渲染跨 OS 有差异）。
本地用 `npm run test:e2e:visual` 运行/生成 win32 基线；Linux 基线由手动工作流
`.github/workflows/visual-baselines.yml` 生成并提交。CI 的 build 作业跑
`xvfb-run -a npm run test:e2e:visual` 作为门禁（apt 装 `fonts-noto-cjk` 保证与基线同字体）。

## 四、无障碍审计债务

`e2e/a11y.spec.ts` 以 axe-core 做门禁：首启建书进工作台后跑 axe，拦截任何 serious/critical 问题。
存量两类（`button-name`、`color-contrast`）已清零：Select 触发器补 `aria-label`，警告横幅与提示文字提对比度；
`KNOWN` 集合已移除，规则不放宽。

## 五、构建档模型（已统一）

`BuildProfile` 单一模型：`core/build/profile.ts`（name/format/selection/transform/render，可选 id/description）。
`core/plugin` 的 `BuildProfileRegistry` 直接引用该类型（删除其自造的 steps 版），注册 key 用 `buildProfileKey`（id 优先、缺省回落 name）。
注册表单源在 `shared/services/buildProfiles.ts`（内置 `core.default`/`core.compendium` + 插件贡献同路径）。
导出弹窗据此提供"导出预设"选择，选中后套用其 selection/transform/render（格式与未选章节仍由本次导出决定）。

发行档（full/webnovel/literary/minimal）单源在 `core/plugin/bundles.ts` 的 `RELEASE_PROFILES`：
设置面板选项、`profileByName` 装配树、`profileDeniesAi` 的 AI 策略判断均读它，未知档名回退
`DEFAULT_RELEASE_PROFILE`。新增发行档只改这一处。

## 七、扩展点（命令与 UI 槽位）

命令注册表 `shared/services/commandRegistry.ts`：命令面板数据源，`register` 返回解绑函数，
应用壳在 `App.tsx` 注册内置命令（命令内容走 ref，注册 effect 只依赖语言/活动书/功能集等稳定原始值），
插件可续注。

UI 槽位注册表 `shared/services/uiSlots.ts` + 渲染点 `shared/ui/Slot.tsx`：应用壳在固定位置渲染
`<Slot id>`，功能/插件注册节点即可插入。`getSnapshot` 按槽缓存保证 `useSyncExternalStore` 引用稳定。
已接入 `topbar.actions`/`nav.actions`/`sidebar.actions`/`editor.toolbar`/`status-bar`，内置贡献在
`app/app-shell/coreSlots.tsx` 注册（命令面板按钮经 `appEvents.ts` 的 `COMMAND_PALETTE_EVENT` 解耦，状态栏读 store）；
新增插槽位置只加 `SlotId` 与一处 `<Slot>`。

设置页签走 `features/settings/services/settingsTabs.ts` 注册表（`settingsTabRegistry`：id/icon/labelKey/group/render(ctx)，
内置与插件同路径）。内置 `plugins` 页签由 `features/settings/coreSettingsTabs.tsx` 注册；`SettingsTabNav`/`SettingsTabContent`
按注册表渲染，插件可续注新页签。

## 八、架构与类型护栏（已接入 verify）

- `deps:check`：`dependency-cruiser`（`.dependency-cruiser.cjs`）——禁循环依赖、禁 `renderer/shared→app`、
  禁 `core→renderer/main`、禁 `renderer→main`。
- `types:escapes`：`scripts/check-type-escapes.mjs`——统计非测试代码 `as unknown as`，超上限即失败
  （2026-09 基线 37，清理后下调）。
- `bundle:check`：`scripts/check-bundle-size.mjs`——渲染层 JS+CSS 体积预算（2026-09 基线约 3014KB，预算 3200KB）。
- lint 类型感知：`no-misused-promises`、`await-thenable`、`no-floating-promises`（均 error；悬浮 Promise 已清零）。
- lint 风格约定：`simple-import-sort`（导入/导出排序，`--fix` 自动修复）+ `@typescript-eslint/naming-convention`
  （变量/函数/类型命名；属性名不约束）。`npm run lint:fix` 会顺带把许可证头搬回文件首位。
- 零警告：`no-non-null-assertion`、`consistent-type-imports`、`react-hooks/exhaustive-deps` 由 warn 升为 error，
  lint 现为 0 errors / 0 warnings。`lint` 带 `--max-warnings=0`，`reportUnusedDisableDirectives: 'error'`，
  无用的 `eslint-disable` 视为错误。
- 穷尽与弃用：`switch-exhaustiveness-check`（`considerDefaultExhaustiveForUnions` 打开，`default` 视为穷尽）、
  `no-deprecated`（联合类型 switch 与弃用 API 用错即报）。
- 直调禁令：`no-restricted-syntax` 禁裸 `localStorage`（唯一出口 `renderer/shared/services/localStore.ts`，
  统一 try/catch 与日志）与 `Math.random` 生成 id（走 `@core/entities` 的 `uuidv7`）；两处算法性随机
  （重试抖动、k-means 初始质心）按文件豁免。
- `lint:dead`：`knip` 统计死文件、未用依赖、未列依赖、未用二进制，接入 verify。`exports`/`types`
  不进 verify（core 公共面有意保留），本地 `npx knip` 全量查看。
- 依赖卫生：清理未用依赖（`chromadb`、`@chroma-core/default-embed`、未用 Radix、`@tailwindcss/postcss`、
  `autoprefixer` 等），补齐隐式依赖（`@codemirror/autocomplete`、`axe-core`、`@eslint/js`）。
  锁定 `@emnapi/core`/`@emnapi/runtime` 为直接 devDependency，稳定 Linux `npm ci` 的 wasm 可选依赖解析
  （knip 的 oxc-resolver 与 sharp 的 wasm 变体共用它们）。



