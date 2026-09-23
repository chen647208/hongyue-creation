# 08 实施路线图（M0–M5 工作包方案）

> 本篇是蓝图落地时的**工作包分解方案**，与 01 篇同为起点时点的排期记录；M0–M5 是当时的里程碑编号。
> 各里程碑的实际落地状态见 `docs/features/` 与 [48 后续任务总表](48-backlog.md)。
> 工作量标注 S/M/L（相对值，非承诺工期）。

## M0 数据地基（→ v1.5）｜ 设计依据：03 篇 ｜ ✅ 已完成（verify 全绿）

| WP | 内容 | 尺寸 | 落点 | 状态 |
|---|---|---|---|---|
| 0.1 | 六实体 + Attribute + EntityChange 类型与校验 | M | `src/core/entities/` | ✅ 类型/校验/SHA-256 哈希/uuidv7，单测覆盖 |
| 0.2 | 类型注册表 + 首批内置模板（03 篇 §2 表） | M | `src/core/types-registry/` | ✅ 19 内置模板 + 注册表，模板驱动字段 |
| 0.3 | DSL 解析/序列化器 + 往返测试 | M | `src/core/dsl/` | ✅ frontmatter(YAML 子集)+关键字行+[[wiki]]，往返保真测试 |
| 0.4 | schema v2（nodes/edges/attrs/revisions/entity_changes/blobs）+ 投影 | L | `repository/schema.ts` | ✅ v2 直接替换 v1（未投产，无迁移框架）；实体化仓库 + FTS 镜像 |
| 0.5 | 索引器（全量+增量+持久化）；consistency/foreshadow 改消费索引 | L | `src/core/index/` | ✅ 纯 buildIndex + IndexService 指纹增量短路 + 序列化编解码；已作为实时派生缓存接入仓库 loadAll/sync/erase（双引擎端到端测试）。prose 级消费方（编辑器波浪线/图谱）随 M1 DSL 落地 |
| 0.6 | 一次性迁移器（v1/JSON→v2） | M | `migrations/v2-import.ts` | ⏭️ 按「本版本未投产」决策降级：schema v2 直接替换，仅保留 JSON→SQLite 首启一次性导入哨兵 |
| 0.7 | 减脂：7 向量服务 → EmbeddingProvider+VectorIndex | M | `knowledge/services/` | ✅ 抽 `EmbeddingProvider`（api/local 选择+自动降级+刷新），删死代码 `simpleVectorStore`，integration 收敛；8 特征测试 |
| 0.8 | 主进程 Provider 骨架 + IPCAPI 类型化 | M | `src/main/app/` | ✅ AppContainer（正序 boot/逆序 shutdown）+ window/file/dialog/vector/sqlite provider |

**退出标准**：verify 全绿 ✅；删 index 缓存可全量重建 ✅（loadAll 冷启动重建测试）；UI 行为不变（纯换底）✅（StorageRepository/SqlDriver 接口未变，消费方零改动）。迁移往返测试按未投产决策不适用。
**风险**：迁移丢数据 → 未投产，无历史数据，风险消除。

## M1 编辑器与状态（→ v1.6）｜ 设计依据：06 篇 ｜ ✅ 已完成（verify 全绿）

| WP | 内容 | 尺寸 | 状态 |
|---|---|---|---|
| 1.1 | TipTap 接入：novel schema + TipTapCanvas 替换 textarea（编排层保留） | L | ✅ **已完成并交互冒烟**：`schema.ts`（StarterKit + sceneBreak/keywordLine/chapterRef/placeholder/darlingSlot/ghostNote/dialogueBlock + quoteStyle/tagRef，`getSchema` 无头验证）；`serialization.ts`（DSL↔PM-JSON 纯函数往返 + 块前缀反斜杠转义保真，14 测）；`commands.ts`（parseBody/serializeBody/applySelectionReplacement，5 测）；`TipTapCanvas.tsx`（受控 content 同步 + `NovelEditorHandle`：PM 语义 `getSelection`/`getKeyboardSelectionMenuPosition`/`focus`）；编排层 `textRef`→`editorRef`，两处 AI 回写改走 `applySelectionReplacement`。浏览器冒烟：渲染/输入/多段/选区唤出 AI 菜单/重载持久化均通过 |
| 1.2 | CM6 novelDsl language（大纲/卡片/prompt 区）+ @tag 校验波浪线 | M | ✅ **已完成并交互冒烟**：装 CM6（`@uiw/react-codemirror` + language/state/view/commands/lint/autocomplete + `@lezer/highlight`）；`editor/cm6/novelDsl.ts` StreamLanguage 与 `@core/dsl/keywords` 同源语法（`# @kw:` 关键字行、`[[链接]]`、`{占位符}`、`***` 场景分隔、顶部 frontmatter、行内 `@tag`），HighlightStyle 映射到 CSS 变量随明暗主题自适应（注：StreamLanguage 只为合法 `@lezer/highlight` 标签名建节点，占位符用 `monospace`）；`tagValidation.ts` 纯函数 `collectTagDiagnostics`（引用行目标/wiki 链接/行内软标签三类，`@tag:` 声明行豁免）+ linter 扩展（300ms 延迟 + 挂载即跑一次 `forceLinting`，受控 value 初始写入不触发 docChanged）；`DslEditor.tsx` 受控组件（语言+校验+`[[`/`@` 自动补全 override，标签集来自 `collectProjectTags`）；`StepOutline` 大纲 textarea 换 DslEditor。21 测（10 语言着色 + 11 校验）；浏览器冒烟：textarea 出依赖树、关键字/标题/链接/值段着色、3 处未定义引用波浪线挂载即现且声明行豁免 |
| 1.3 | 单一变更管线：transaction → Store.apply → entity_changes + Revision | M | ✅ **已完成并验证**：`saveProject(project, {agentId, cause})` → 正文实质变化才追加 `revisions`（seq 续号、author=agentId、cause 留底），`loadRevisions(nodeId)` 读取；entity_changes 贯穿 agentId（双引擎 6 测）。**归因透传已接通**：`PersistOp.saveProject.opts` → `projectStore.updateActiveProject(updates, opts)`（WeakMap 绑新引用）→ 桥消费 → 6 Step + 写作 + 助手 17 处 AI 落笔点标注 `ai:<来源>`；修订页第三 tab 直连 `loadRevisions`。**修订回写闭环**：`ChapterHistoryModal` 修订 tab 的恢复按钮走 `onApplyContent(rev.body)` → `updateChapterContent` → `saveProject`，恢复本身追加一条新修订。持久化侧 `persistDiff` 已做哈希差分（仅真实变化实体写盘）。PM 级细粒度 Store.apply（实体级引用保持）无实测性能问题，转为非阻塞优化，不再列为里程碑退出条件 |
| 1.4 | 8 个写作原语扩展（enterFlow/placeholder/darlings/ghostOutline/…） | L | ✅ **已完成并交互冒烟**：`primitives.ts` 八件套全部做成 TipTap 行为扩展（节点类型复用 schema.ts，不重复定义）——`enterFlow`（Enter×1 新段/×2 空段→sceneBreak/×3 回调新章，连按计数实例级闭包，走 `chain()` 单事务）、`InsertPlaceholder`（Mod-Shift-X 插占位符）、`Darlings`（`harvestDarling`/`restoreDarling` 命令，选区↔darlingSlot 锚点）、`GhostOutline`（`insertGhostOutline` 命令 + appendTransaction「打字即覆盖」仅转换被输入触及的 ghostNote）、`NovelTypography`（---/.../\" 三条 InputRule）、`SpellOnDemand`（默认关，`setSpellcheck` 命令主动开）、`TagDecorate`（PM Decoration 软高亮 @tag，不碰正文）、`ChapterRenumber`（`renumberChapters` 命令重写「第N章」前缀交还宿主）；`createWritingPrimitives()` 装配，`TipTapCanvas` 挂载 + `NovelEditorHandle` 暴露 harvest/ghost/spellcheck，`WritingEditor` 接 Enter×3 新章。17 个 PM 事务级测试（jsdom）；浏览器冒烟：@tag 装饰实时渲染、占位符快捷键、Enter×2 场景分隔均通过 |
| 1.5 | Zustand 双 store；App.tsx 收编（<150 行）；persistDiff 做一致性哨兵 | M | ✅ **已完成并交互回归**：`stores/settingsStore.ts`（模型/提示词/一致性/外观切片，setLanguage/setTheme 即时生效）+ `stores/projectStore.ts`（书籍 CRUD 动作，写路径收敛 updateActiveProject/upsertProject/removeProject/renameProject，11 测）；`stores/persistenceBridge.ts` 订阅双 store → persistDiff 差分落盘 + 自动备份（首启基线不整体重写）；`App.tsx` 纯装配（引导在 `useAppBootstrap`，书籍/导入动作在 `useBookActions`，工作台路由在 `app-shell/WorkspaceView`，设置宿主 `SettingsModalHost`，重置弹窗 `ResetAlertDialog`）。浏览器回归：建书/进书/编辑/灵感回写/全量重载持久化均通过 |
| 1.6 | UI 宪法落地：NewBookModal 先建后改；引导模式与自由工作区并存 | S | ✅ **已完成并交互冒烟**：`useBookActions.createQuickBook()` 一键建空白书（默认名「新小说」，重名自动加序号）直接进工作区、不开模态（宪法 §3.2「给默认值不逼决定」）；Bookshelf 主按钮「新建书籍」= 快速建，次按钮「从模板新建」= 保留 NewBookModal（空白/复制/示例）非阻塞入口；`WorkspaceTopbar` 书名就地改名（点标题→Input→Enter/blur 提交 `renameBook`，Esc 取消）；`guidedFlow.suggestNextSection()` 纯函数按完成度（灵感→世界→角色→大纲→章节→写作，与导航同序）给「建议下一步」，顶栏可点跳转、可关闭、当前步不提示——引导是可选轨道不是牢笼（§3.3 无模式，nav 本就无门禁自由切换）。8 测（guidedFlow）；浏览器冒烟：快速建书无模态直接进区、顶栏改名持久化、填灵感后出现「建议下一步：世界构建中心」并可跳转、「从模板新建」仍开模态均通过 |

**退出标准**：06 篇 §6 全部 5 条；textarea 出依赖树；编辑延迟基准达标。
**本轮边界说明**：M1 的 schema/序列化/修订管线/画布替换/状态收编/写作原语/CM6 novelDsl 大纲编辑器/UI 宪法（先建后改 + 引导并存）均已完成并验证，`npm run verify` 全绿。CM6 触及运行中 App 的编辑器扩展层，已配交互回归验证（挂载即校验、着色、波浪线、声明豁免）。M1 退出标准达成。

## M2 AI 层重构（→ v1.7）｜ 设计依据：05 篇 ｜ ✅ 已完成（verify 全绿）

| WP | 内容 | 尺寸 | 状态 |
|---|---|---|---|
| 2.1 | AiGatewayProvider：适配器上移主进程 + 类型化事件流 IPC | M | ✅ `src/main/ai/gateway.ts`（适配器+事件流 IPC，单测覆盖） |
| 2.2 | ToolRegistry + 17 个 `core.*` 内置工具（4 个 prompt 服务工具化转写） | L | ✅ `src/core/ai/tools.ts`（注册表+内置工具，单测覆盖） |
| 2.3 | PromptAssembler（section 装配器，拆 aiContextBuilder） | M | ✅ `src/core/ai/promptAssembler.ts` + `builtinSections.ts` |
| 2.4 | 技能引擎：SKILL.md 加载 + 渐进注入 + 首批 5 内置写法技能 | M | ✅ `src/core/ai/skills.ts` + `skills/builtin/`（每轮重取 context，白名单拦截） |
| 2.5 | 审批三档 + diff 预览 + 待审箱 + 超时降级；三级审计链闭合 | L | ✅ `src/core/ai/approval.ts`（三档+待审箱 `pending-proposals.jsonl`），斜杠建卡与 MCP 落库同标准走审批 |
| 2.6 | 会话事件流（jsonl）+ AIHistoryViewer 升级事件浏览器 | M | ✅ `SessionEventBrowser.tsx`（用量汇总含缓存读写 Token） |
| 2.7 | MCP server 出口 + GlobalAssistant 自举吃 MCP | M | ✅ `src/main/mcp/server.ts`（stdio 可发现，提案执行器落库，`ai:mcp` 归因） |

**退出标准**：05 篇 §8 全部 5 条；旧 prompt service 删除（无双轨）。

## M3 插件化（→ v2.0 公开）｜ 设计依据：04 篇 ｜ ✅ 已完成（verify 全绿）

| WP | 内容 | 尺寸 | 状态 |
|---|---|---|---|
| 3.1 | manifest schema 校验器 + 加载器（逐插件隔离 + 状态面板 + 一键禁用） | L | ✅ `src/core/plugin/manifest.ts`（版本区间满足判定）+ `pluginService.ts` 磁盘发现 + `PluginSettingsPanel` 状态面板 |
| 3.2 | 生命周期/unwind/命名空间/错误契约/权限代理 | L | ✅ `runtime.ts`（拓扑激活/unwind 逆序释放）+ `context.ts`（deny-by-default 权限代理） |
| 3.3 | 贡献点 v0 三类：类型模板/技能/Build 渲染器 | M | ✅ skills/types/buildProfiles/hooks 全接线进注册表（`createContributionInstaller`） |
| 3.4 | Dogfooding：15 个 feature → 内置 bundle（先 cards/world/timeline，再 outline/foreshadowing，最后 AI bundle） | XL | ✅ core/world/ai 三内置 bundle（`builtin/manifests.ts`），官方功能与社区插件同路径 |
| 3.5 | profile/bundle/patch 装配 + 装配树查看器；minimal/webnovel/literary 三预设 | M | ✅ `bundles.ts` + `availability.ts`（三预设 + 装配树 + minimal 禁 AI 策略） |
| 3.6 | 导出 Build Profile 全管线（07 篇，含预览与字数统一） | L | ✅ `src/core/build/`（select/transform/render + rtf 渲染器 + YAML 往返）；导出弹窗与统计面板同源（07 §5.4 断言测试） |
| 3.7 | 插件 SDK 包（MIT）+ 示例插件（"魔法体系"模板 + "rtf 渲染器"） | M | ✅ `sdk/`（MIT 独立发行）+ `examples/plugins/magic-system`（磁盘实测：manifest 校验 + 类型命名空间 + 技能解析） |

**退出标准**：04 篇 §10 全部 5 条 + 07 篇 §5；示例插件不改内核通过；`/core:*` 命令全部走命名空间。

## M4 表面扩展（→ v2.1+）

- 辅助窗口（一致性报告/导出预览，Zettlr win-* 模式）｜ S
- 贡献点 v1：命令/UI 槽位/编辑器扩展沙箱（worker+iframe）｜ L
- 同步地基启用：entity_changes pull/push 协议 + 冲突副本 UI（03 篇协议，LWW 禁用）｜ L
- 逐条目加密（protected session）｜ M

## M5 生态（→ v2.x）

- 插件文档站（规范放仓库内版本化——Twine 教训）｜ M
- VS Code 形态支线：core npm 包 + 最小扩展（书架只读 + 卡片编辑）｜ L
- 贡献点 v2：hooks 接缝/主题 ｜ M
- 兼容性 CI（宿主版本区间矩阵）+ 插件状态上报 ｜ M

## 横切策略

**测试**：28 → M0 末 ≥60（实体/DSL 往返/索引增量/迁移）→ M3 末 ≥120（隔离/unwind/权限/管线 E2E）。覆盖率分层锁线见 `vitest.config.ts`（以当前全绿为准，时点计数不进正文）。CI 新增：core 边界 lint、DSL 往返、插件隔离冒烟三 job。
**回归门**：每 WP 合入跑 `npm run verify`；每里程碑加手工冒烟清单（建书→写作→AI→导出→重启恢复）。
**不做清单**：多用户/协作（M5 后议）；移动端；云同步服务；WASM 插件（观察 Zed 后再议）；保留 v1 双写兼容（用户规则：直接替换）。
**依赖顺序**：M0→M1→M2→M3 严格串行（数据层→管线→AI→插件）；M3.4 dogfooding 可与 3.5/3.6 并行。

## 风险登记（更新自迁移计划粗排）

| 风险 | 等级 | 缓解 |
|---|---|---|
| M0 迁移丢数据 | 高 | 快照+双读校验期+样本往返测试 |
| TipTap 替换 textarea 引发写作体验倒退（光标/输入法/性能） | 高 | M1 期间双内核灰度开关；中文 IME composition 专项测试 |
| 15 feature 插件化（M3.4 XL）周期失控 | 中 | 按依赖序分批，每批可发布；先易后难 |
| AI 上移主进程破坏现有流式体验 | 中 | 2.1 先做双跑对比（渲染层旧路径 vs 网关新路径）再切 |
| 插件规范过度设计 | 中 | v0 只开 3 类贡献点；接缝按需求出现再开 |
| AGPL 与插件生态 | 低 | SDK 单独 MIT（04 篇 §9），FAQ 说明边界 |
