# 48 后续任务总表（排序）

## 背景与目标

34–47 与 26/28 的设计稿铺开了大量能力，缺一份把它们按依赖与收益排好序的总表。本表是执行口径：编号、任务、依据、依赖、验收、规模；落地后从本表移除，回写对应 `docs/features/`。

## 排序原则

1. 先做"零新依赖、复用既有底座、多域受益"的项。
2. 被多项依赖的地基先做（查询/块引用 → 跨域视图；修订/快照 → 时间线版本）。
3. 每个创作域的 A 档补齐优先于单域 S 档打磨。
4. 每项独立可测、可提交；出现第五类落点（核心/视图类型/资源型插件/逻辑型插件之外）即回评审。

## 阶段 0 收口与地基

本阶段已收口：工具参数 JSON Schema 校验（0.4）、发行档 webnovel/literary 差异化（0.5）、MCP 检索走 FTS + 标题回退（0.6）、插件逻辑贡献权限门与清单校验（0.3）、覆盖率门线阶梯上调（0.7）。`contributes.renderers` 的描述符协议已立项（见 49）。0.1/0.2 判定不做（见文末）。

## 阶段 1 查询、块引用与素材隔离（45，推荐先做）

已落地：视图即保存的查询（条件与或非/嵌套、计算列、聚合、多套具名视图、纯函数投影重算）；块级稳定标识（编辑器内生成/保留/重排不变/去重）+ 块 ID 落盘（DSL 块锚 `^id` 往返，编译/统计前剥离）；素材隔离（`Chapter.material` 单源，字数/编译/检索三处口径，检索素材优先）；块引用与嵌入（`((^id))`/`!((^id))`，反向引用面板、失链提示与跳修、环检测，导出统一展开）。

## 阶段 2 修订、批注与关联（38）

已落地：修订标记（快照/修订版为基线的字符级差异，逐处接受/拒绝并写回正文，字数与导出随正文同源更新；决策经章节侧车字段跨会话续审；上一处/下一处导航与快捷键）；行内批注（选区挂批注、回复、解决/重开，块标识 + 偏移 + 引用锚定，失锚提示，侧车存储不进入正文与导出；编辑器高亮点击直达线程）；角色登场章节列表与跳转（含别名与引用匹配）；正文→章纲提取（预览勾选、只填空不覆盖；草稿逐条编辑；按大小与 token 预算分批送模型，失败可续提剩余批次）。

## 阶段 3 同步传输与冲突（36）

已落地：同步集合补齐——边参与插入与合并（稳定键 `from/to/kind/role` 去重、重复导入幂等、同 id 冲突转人工）；既有节点的新增属性补插；传输接口与三后端（本地目录 / WebDAV / S3 兼容 SigV4，主进程实现 + IPC，凭据入钥匙串，各带连通测试与有限重试；渲染层暴露 list/remove 可用于远端查看与清理）；冲突三选（保留副本 / 应用远端 / 标记待处理）+ 自动恢复记录 + 用留档包一键重解已登记冲突；退出导出按书筛选、单本上传超时，失败下次启动提醒并可重试；分片传输（按 chunk key 断点续传，重试跳过已完成分片，合并校验总摘要，三后端共用同一协议；浏览器端 WebCrypto 同协议）。

## 阶段 4 AI 上下文注入与可信检索（37）

已落地：上下文注入（按章节/实体/关键词推断目标，编辑器真实暴露活动章节与选中实体；装配正文片段、细纲、前情、实体、知识库、时间线、检索命中；逐条来源标注与触发原因；开关与单条关闭按书持久化；预算 6000 单源常量、超预算按优先级裁剪并记录被裁条目；带 `original` 的引用与检索片段均做逐字校验，不一致剔除）；可信检索（命中规范化为 `Citation`，去重排序，空结果明确措辞不编造；`core.text.search`/`semanticSearch` 返回 `found`/`citations`；答复按出处分栏并可点跳来源）；按视图范围的注入（注入时按 bookId 查询视图定义，用同源纯函数投影可见实体、类型筛选、条件摘要与列）。

## 阶段 5 编译与导出（39）

已落地：编译档案（可命名保存/复用/删除，YAML 导入导出；范围 `from/to`、素材口径、标题层级、分卷/前言/后记、目录开关与深度；默认档案逐字等价现状）；管线支持分卷/目录/前后置页块，md/txt/html/rtf 四渲染器按 kind+level 序列化，PDF/ePub/DOCX 既有入口接线；ODT 渲染器（`core/build/odt.ts` 产出最小 ODF 文件集，复用 `core/build/zipStore.ts` STORE 打包，标题写 `text:outline-level`）；导出对话框编译编排选择器（分卷/前言/后置节点，目录深度与开关，标题层级，章节范围）；块锚与批注/修订不入正文，引用统一展开，字数与导出同源。

任意视图导出为表格已落地（`views/viewExport.ts`：Markdown/CSV/HTML，计算列随导出保留；`views/viewPresets.ts` 提供分镜表预设，口播时长为计算列公式，语速为视图参数）。

已落地（阶段 8 跨域视图部分）：视图行数据源覆盖章节（正文 DSL 关键字解析为行字段）、扩展类型（`Project.extensions` 条目按原键投影）与清单项，分镜镜头经此进入视图行。

- 类型级分卷：导出弹窗「分卷类型」多选写入 `compile.volumeTypes`；`Project.groups` 投影为 `novel.part` 节点参与编译。

归属调整：分镜表/口播时长等垂直形态不进核心。核心提供通用能力"任意视图导出为表格（Markdown/CSV/HTML）"；分镜表由剧本模板场景视图表达，口播时长由计算列公式表达（语速为用户参数）。可执行导出渲染器待插件渲染器协议（见 40）。

## 阶段 6 时间线深化与版本（46）

已落地：非破坏操作（`timeline/timelineOperations.ts` 的插入/覆盖/滑动/移动/删除/卷动，配快照式撤销栈 undo/redo，撤销后逐字段还原；工具栏插入语义、覆盖动作、卷动与撤销重做）；草稿矩阵 ↔ 成稿轨道同源投影（`timeline/draftMatrix.ts` 从 `Project.chapters` 投影矩阵、逆向写回 `order`/`trackId`，成稿轨道再由同一 `chapters` 派生，无第二份真相）；外部写入（AI/同步/其他视图）登记为可撤销编辑且撤销栈持久化，保证撤销一致性；快照比较与回滚（`version/snapshotRollback.ts` 行级 LCS 逐段比对，整体/逐段回滚、以及修订应用与 AI 重放路径改动前均自动追加 `before-rollback` 快照）；AI 试错快照（`assistant/services/aiTrialSnapshotService.ts` 每次写类工具事务前落一步、会话内可回滚任意步，与正式历史隔离，`TrialSnapshotButton` 二次确认回滚；快照落本地侧车，重启后仍可回滚）。

## 阶段 7 跨设备与移动端（35）

已落地：响应式重排（`shared/utils/layout.ts` 断点单源，书库/阅读/轻编辑/统计/助手手机档流式重排，助手与参考面板改覆盖层，表格/时间线保留固有横滚，硬编码色改语义变量）；移动端落盘（`visibilitychange`/`pagehide` 强制刷盘，冲突副本复用 `mergeBundle`）；触控与无障碍（关键路径 44px 命中区、`deleteGuard` 删除二次确认、尊重 `prefers-reduced-motion`）；PWA manifest。

未做：无。44px 命中区经 `.touch-target`（单源常量）覆盖组件库 `size="icon"`、`iconOnly` 纯图标按钮、`TabBar`/`SegmentedControl`/`ViewModeToggle` 与裸 `<button>` 图标控件；表格/时间线固有横滚内部为有意例外。

## 阶段 8 跨域视图与脚本层（47）

已落地：跨域投影（`buildEntityView` 从六实体扩为任意域：章节、知识库/伏笔/计划/分组、规则、世界观、`Project.extensions` 扩展类型；章节 DSL 关键字 `# @键: 值` 抽取为行字段；`ViewLayout.fieldAliases` 对齐跨域字段名）；脚本层（`shared/formulaScript.ts` 表达式树：字段/参数/字面量/白名单函数，无网络/文件/`eval`/成员访问，深度与参数配额，deny-by-default；`contributes.formulas` + `FormulaRegistry` 插件公式，命名空间强制、可回退）；图表视图（视图类型 `chart`，`ChartSpec` 声明「字段→通道」，轴/图例/比例尺由声明派生，渲染器按需加载懒加载）；协作收敛不变量（`features/collaboration/elementConvergence.ts` 纯函数封装版本号/随机决胜/墓碑/分数排序，配契约单测；运行时收敛仍由 Yjs 提供）。

未做：无。画布视图开放格式仍属有意挂起；脚本命令管道/循环/子程序/事件触发的描述符协议已立项（见 49）。

## 阶段 9 创作域 A 档补齐

已落地：非虚构引用（`core/dsl/citation.ts` 正文 `[@key]`/`^[脚注]`；来源类型模板 `meta.reference` 结构化字段；`buildCitationUsage` 双向关联与失链；文献表样式 `numbered`/`author-date`，去重与编号重排；导出集成 md/html/ODT/DOCX，块锚与批注不入正文）；分支叙事（`core/build/branching.ts` 场景/选择项/变量、受限条件求值、跳转表、可达性校验、分支视图投影与首遍阅读预览）。

- 交叉引用：正文 `((#目标))`/`((#目标|模板))`，章节与图表编号编译期重算，失链提示（`core/dsl/crossRef.ts`）。
- 对照视图：`Project.translation` 侧车存段落对齐与逐段确认，`core/build/alignment.ts` 重算并保留未变段确认。
- 绘本：`Project.pictureBook` 页结构与图位，`core/build/picturebook.ts` 导出图文页，缺图占位。
- 诗歌：分行正文 DocBlock，`# @verse: true` 或 `poem.*` 类型识别，md/txt/html/ODT 保留分行。
- 分支模型：`Project.branching` + `branch.scene`/`branch.variable` 类型模板，视图与校验走真实数据。

## 阶段 10 生态与运行时（40）

已落地：插件目录与安装/更新/卸载（`core/plugin/catalog.ts` 解析与决策、`installer.ts` 编排安全门：读取包→manifest 校验→来源白名单→host 区间→签名/摘要→版本决策→原子提交；`main/app/pluginStore.ts` 真实落盘与回滚、卸载清理；插件面板入口与安装后重建宿主）；联网搜索/翻译作为插件的门与契约（`core/plugin/netGate.ts` 默认拒绝、仅 https、精确/子域匹配；`main/net/pluginNet.ts` 策略与代理；`fetchAsPlugin` 激活 + `permissions.network` 门；`core.net.fetch` 唯一出口；`core/ai/untrusted.ts` 不可信围栏）；本地推理接入层（`core/ai/localInference.ts` 端点/风味/模型解析与回落决策，`main/ai/localRuntime.ts` 进程管理与探测，设置面板启停与探测）；多助手会话（按会话 id 隔离事件流与注入上下文、技能按 scope 激活、每会话独立审批路由、任务并发上限、归档/命名/搜索）；MCP 资源面补全与自举（toc/entities/chapter/stats 资源；内置助手经 `InProcessMcpClient` 走同一 server 与同一待审箱）。

未做：无。目录索引级 detached 签名、来源白名单空时失败闭合、搜索/翻译示例插件、本地推理接入生成路径与启动参数 UI、归档会话恢复、多会话标签、MCP 资源只读内置工具均已落地。

## 阶段 11 无障碍与国际化品质（43，可并行）

已落地：axe 审计扩到全部主要面板并以 `PANEL_DEBT` 棘轮登记欠账（含设置 10 页签、结构、写作、数据视图、时间线、角色等，未登记规则零容忍）；实跑全部面板并通过，逐面板补齐无名字控件（Select/range/图标按钮/Progress 加 `aria-label` 或 `label htmlFor`，中英字典同步），棘轮额度实测后收紧；对比度取安全值（`--muted-foreground` 浅色 `#6b6560`，`text-muted-foreground/70` 改 `text-foreground/70`）；中英键集对齐由 `shared/i18n/catalog` 单源驱动（命名空间集合与键集零缺失零多余、占位符一致）并补语言切换断言；键盘路径修复（新书弹窗标签关联与 radiogroup、图标按钮可访问名、搜索结果行可键盘激活、Dialog 关闭文案走字典）与全链路用例。

未做：结构页 CodeMirror `.cm-placeholder` 对比度仍登记为欠账 1（第三方渲染，未改内核源码）；视图 feature 与编辑器内核其余低对比类已改语义变量。win32 视觉基线已重生，Linux 基线由 CI 校验通过。

## 未落地项（v0 分诊「可拖」，逐条给验收）

阶段 0–11 的能力已全部落地，下表是 `docs/guides/v0-readiness.md` §二 分诊清单里标「可拖」的残项。
每条给现状、缺口、依赖、验收、规模（S/M/L 为相对值）；落地后移出本表，回写 `docs/features/` 对应篇。

### 1. 渲染产物体积：补 bundle 组成分析

- 现状：`scripts/check-bundle-size.mjs` 只输出总量与超限时的 Top-8 文件。已有的按需加载共四处：`src/renderer/app/App.tsx`（助手与设置等四个挂载层）、`app-shell/WorkspaceView.tsx`（各分区 Step）、`features/views/MultiViewPanel.tsx`（ChartView 与 ViewCanvas）、`shared/services/rendererExecutionPort.ts`（quickjs 动态 import）。
- 缺口：无组成分析口径；导出链（`core/build` + `zipStore`）与插件运行时未系统拆出；i18n 未分片，`src/renderer/i18n/config.ts` 静态引入全部语料，中英语料随主包进默认 chunk。`vite.config.ts` 明确放弃 `manualChunks`（分包环曾致白屏），当前完全靠 Rollup 自动切分。
- 依赖：无。
- 验收：`npm run bundle:check` 之外补一步输出各 chunk 体积与 top 依赖占比；导出与插件运行时改为按需加载后总量下降且 `npm run test:e2e` 全绿（防分包环复现）；i18n 语料拆出后首屏 chunk 不再含未启用语言。
- 规模：M。

### 2. 视图条件编辑器支持 OR/NOT 与嵌套

- 现状：引擎完整支持任意嵌套，`features/views/viewQuery.ts` 的 `evaluateCondition` 递归处理 and/or/not，`viewLayout.ts` 的 `parseCondition` 可把任意嵌套树存回 `ViewLayout.conditions`。
- 缺口：条件编辑器全内联在 `features/views/MultiViewPanel.tsx`——`conditionLeaves` 只取 `type === 'and'` 的叶子，增删都按平铺 AND 重写。配置里若是 or/not 树（插件或手写 JSON 写入），面板显示「无条件」，首次添加会用平铺 AND 静默替换整棵树。
- 依赖：无。
- 验收：面板可建 OR/NOT 分组并嵌套编辑；非 AND 根树的配置能被无损显示，不再被首次编辑替换；既有平铺 AND 配置读写往返不变；`viewQuery` 的递归求值补 UI 层单测。
- 规模：M。

### 3. 视图行标签缺失扩展字段

- 现状：`Project.extensions` 的条目已由 `features/views/buildEntityView.tsx` 把自有键 spread 进行字段，并写入 `row.values` 与 `row.cells`；六实体本身没有自定义字段概念。
- 缺口：`MultiViewPanel.tsx` 的 `queryFieldLabels` / `fieldLabel` 映射不含扩展键，条件与计算列里选到扩展字段时回落显示原始键名。
- 依赖：无。
- 验收：扩展键在条件、计算列、图表通道的下拉与摘要里显示类型模板的标题（取类型注册表，未命中才回落原键）。
- 规模：S。

### 4. 计算列 key 冲突校验

- 现状：`viewLayout.ts` 的 `parseComputedColumns` 只校验 key 非空与表达式合法；`viewQuery.ts` 的 `applyViewQuery` 无条件把计算列追加进 `columns` 并把值写进 `row.cells[key]`；`MultiViewPanel.tsx` 的 `addFormula` 只按 `computed:` 前缀自查重。
- 缺口：计算列 key 与既有列（`ENTITY_VIEW_COLUMNS` 或行字段）撞车时，同名单元格被静默覆盖，列出现两份。
- 依赖：无。
- 验收：保存配置时校验计算列 key 不与既有列及彼此重复，冲突给出明确错误并保留原配置不落盘；`viewLayout` 补重复 key 拒绝用例。
- 规模：S。

### 5. 图表 type 与 aggregate 进 UI

- 现状：引擎完整支持，`features/views/viewChart.ts` 的 `resolveType` 与 `aggregate` 已实现，`viewLayout.ts` 的 `parseChartBinding` 校验并往返 `binding.type` 与 `binding.aggregate`；`viewPresets.ts` 无任何图表声明。
- 缺口：`MultiViewPanel.tsx` 图表区只暴露 mark 与五通道的字段下拉，`setChartBinding` 只写 `{field, channel}`；type 与 aggregate 目前只能来自手写配置或插件写入。
- 依赖：无。
- 验收：图表区可为 `y` 通道选聚合方式（sum/avg/min/max/count）、为 `x` 通道选维度类型（category/time/quantitative）；选择经 `parseChartBinding` 往返不丢；默认声明不变。
- 规模：S。

### 7. 跨章块跳转改事件驱动

- 现状：`features/writing/WritingEditor.tsx` 的 `handleJumpToBlock` 在目标块位于其它章时记下待跳并切换活动章节，随后用 `setTimeout(…, 50)` 等编辑器就绪。`NovelEditorHandle` 与 `TipTapCanvas` 都没有就绪回调，50ms 是猜的值。
- 缺口：慢设备上待跳请求被消费但块尚未渲染，跳转丢失。
- 依赖：无。
- 验收：编辑器就绪后主动回调（或等价事件）驱动待跳队列，删掉该处定时等待；用一把延迟注入把渲染推迟到远超 50ms 仍能跳成功；原有跳转用例保持通过。
- 规模：S。

### 9. Service Worker 产物与移动端实测

- 现状：manifest 在 `src/assets/manifest.webmanifest` 并由 `src/renderer/index.html` 引入；`scripts/build-service-worker.mjs` 由 build 联动产出 `build/renderer/sw.js`，注册门 `src/renderer/app/registerServiceWorker.ts` 限定生产、非 Electron、非 `file:`；响应式单源在 `src/renderer/shared/utils/layout.ts`（`MOBILE_MAX_WIDTH` 639 / `TABLET_MAX_WIDTH` 1023 / 44px 命中区）；e2e 已有 390×844 手机宽度的 axe 用例。
- 缺口：没有 e2e 实跑产出的 `sw.js`（离线壳、缓存失效、安装提示均未测）；`playwright.config.ts` 无 mobile project 与视口配置。
- 依赖：无。
- 验收：playwright 增加 mobile 视口 project（已有 390 宽度的断言迁入或保留）；至少一条用例验证 SW 注册成功后断网可再加载写作区、且新版本发布后缓存键变化导致旧缓存失效。
- 规模：M。

### 10. 导出对话框列出插件渲染器

- 现状：渲染器注册表与解析规则在 `core/build/pipeline.ts`（显式 `options.rendererId` 或 profile 命中插件渲染器优先），profile 字段与校验在 `core/build/profile.ts`，宿主端口在 `features/writing/utils.ts`。
- 缺口：`features/writing/components/ExportChapterModal.tsx` 的 `FORMAT_OPTIONS` 是硬编码的 8 个内置格式，不调用 `listRenderers()`；用户只能把 `<插件短名>.renderer.<id>` 写进档案 JSON 间接触发。
- 依赖：无。
- 验收：导出对话框的格式下拉在 8 个内置格式之后列出已注册的插件渲染器（不可用或未激活的置灰并说明原因）；选中后走 `runBuild` 的 `rendererId` 显式参数，无需改档案 JSON；补一条带注册渲染器的单测。
- 规模：S。

### 11. `chapter.save` 首帧派发边界

- 现状：派发点在 `src/renderer/app/stores/persistenceBridge.ts` 的 `emitChapterSaveEvents`，只遍历 `persistDiff` 的 ops，且按章节对象引用相等跳过未变章节；`doFlush` 在无前序基线时走 `repository.saveAll` 且 `ops` 为空，随后以空 ops 调派发。基线由 `seedPersistBaseline` 在 hydrate 后建立。
- 缺口：首帧全量落盘一个 `chapter.save` 都不发（插件订阅者漏掉首次保存）；派发以引用相等判变化，深相等但重建引用的章节会被重复派发。两条边界都无测试。
- 依赖：无。
- 验收：首帧全量保存按「基线不存在」语义补派发（或明确记为首帧不派发并在文档与插件协议里写死，二选一，不留给实现细节）；引用相等改为可判定的变化集；`persistenceBridge` 补首帧与重建引用两条用例。
- 规模：S。

## 有意挂起（不做，非欠账）

- 卡片服务从 `shared/services/cards` 迁入 `features/cards`：会重新引入 `assistant→cards`、`settings→cards` 跨 feature 依赖债（与 02 的边界规则和既有清理方向相反）；卡片服务属跨功能共享，保留在 `shared/services/cards`，`features/cards` 目录仅在未来出现卡片专属 UI 时使用。
- `foreshadowing`/`consistency` 服务从 `shared/services` 迁入功能域：同卡片，属跨功能共享逻辑，迁入会引入跨 feature 依赖债；保留在 `shared/services`，域目录只承载 UI。
- 正文以文件为源、追加式事件日志（用户已明确暂缓，见 28）。
- 协作 B/C 档的评论权限与工作流（协作只留缝，见 29）。
- 平台化：发布、社区、收益、全勤、平台合规预审。
- CAD/三维参数化、游戏运行时脚本、闭源云工具格式与依赖。
- Tauri/移动原生栈：移动需求出现前不迁。

## 执行约定

- 每项落地走同一门禁：`npm run verify`，运行时/UI 改动跑 `npm run test:e2e`，独立提交。
- 功能落地同步 `docs/features/` 对应篇，本表移除该项。
- 许可审查：只借鉴设计，不引入 copyleft 代码；重型运行时仅限可选插件。
- 体积与性能：渲染器按需加载，纳入体积预算。预算值与当前基线以 `scripts/check-bundle-size.mjs` 为唯一来源（本文件不复制数字）；待精简未引用 wasm、导出与插件模块懒加载、i18n 分片后下调。
- 插件可执行协议（见 49）：协议层、宿主接线、脚本异步执行、渲染器同步执行、能力派发与审批接线、`core/build` 消费插件渲染器、事件触发（`project.open`/`chapter.open`/`chapter.save`）与 QuickJS 单变体精简均已落地。
