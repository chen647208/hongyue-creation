# 世界观与一致性功能说明

## 适用范围

本文件覆盖世界观编辑、时间线编辑、图谱展示与一致性检查能力。
对应代码主要位于以下目录：

- `src/renderer/features/world`
- `src/renderer/features/timeline`
- `src/renderer/features/consistency`

## 核心文件

- `world/WorldViewEditor.tsx`：世界观主体编辑
- `world/LocationEditor.tsx`：地点编辑
- `world/FactionEditor.tsx`：势力编辑
- `world/RuleSystemEditor.tsx`：规则体系编辑
- `world/WorldViewGraph.tsx`：世界观图谱展示
- `timeline/TimelineEditor.tsx`：时间线编辑
- `timeline/EnhancedTimeline.tsx`：增强时间线展示
- `consistency/ConsistencyChecker.tsx`：一致性检查界面
- `consistency/ConsistencyPromptManager.tsx`：一致性模板管理界面
- `world/services/worldConsistencyService.ts`：世界观一致性检查服务
- `consistency/services/consistencyCheckPromptService.ts`：一致性模板服务
- `consistency/services/vectorSimilarityService.ts`：语义相似度与辅助检查服务

## 主要职责

- 世界观编辑器负责维护地点、势力、规则体系和宏观世界设定
- 时间线模块负责事件顺序、历史节点和章节时间关联
- 一致性模块负责规则检测、模板驱动检查和语义辅助判断
- 图谱与增强时间线负责可视化展示，帮助定位关系与冲突

## 与知识库的关系

- 这些能力大多从知识库中心入口打开
- 一致性检查和推荐能力会复用知识条目、人物、地点与时间线数据

## 数据视图

- 入口：世界分区「数据视图」开关卡，组件为 `src/renderer/features/views/MultiViewPanel.tsx`。
- 数据来源：`buildEntityView.ts` 把角色、地点、势力、事件拍平为行与关系边，列固定为类型/名称/摘要/详情。
- 视图种类：表格（`ViewTable.tsx`，`@tanstack/react-table` 排序与列显隐）、卡片（`ViewCards.tsx`，`@tanstack/react-virtual` 按行虚拟化）、关系图（`ViewGraph.tsx`，按类型着色，边来自角色↔势力↔地点↔事件关联）、大纲（`ViewOutline.tsx`，编号列表）、读者预览（`ViewReader.tsx`，按桌面/平板/手机宽度正文排版）。
- 拖拽分配：把字段拖入字段区显示该列，把类型拖入类型区按该类型筛选（原生 HTML5 拖放，无额外依赖）。
- 布局持久化：视图类型、列、隐藏列、排序、类型筛选、读者设备宽度写入 `views` 表的 `ViewDefinition.config`，经 `genericModelStore` 读写；上次选中视图按作品记在 `localStore` 的 `views.selected`。

## 双轴时间线

- 入口：世界分区「双轴时间线」开关卡，组件为 `src/renderer/features/timeline/DualAxisTimeline.tsx`。
- 两轴：叙事顺序轴按章节 `order` 排布、片段宽度由 `Chapter.duration`（相对时长，默认 1）决定；故事时间轴按事件日期（`HistoryDate` 折算为月刻度），同一刻度的多个事件分层显示。
- 交互：章节片段可拖拽重排与跨轨移动（松手写回 `order` 与 `trackId`）、右端拖动裁剪时长（`Chapter.duration`）、刻度吸附、缩放（按钮与 Alt+滚轮）、播放头、重大/次要过滤、在播放头处拆分章节；章节与事件的关联经 `chapter.timelineEventId` 画连接虚线。
- 性能：片段按滚动视口裁剪渲染（`inView`），长书滚动不退化。
- 多轨与张力：轨道定义存 `Project.timelineTracks`，可增删轨道（删轨把章节归入其余轨）；上方张力曲线按 `Chapter.tension`（0..1）绘制，拖动节点改张力。
- 标记：在播放头处添加标记（`Project.timelineMarkers`，钉在叙事轴），点击定位、双击或列表删除。
- 合并：选中多个章节后写 `sequence_items`，以分组节点（`groupId`）记录包含关系；取消合并移除分组并清空 `parentId`。
- 确定性一致性检查：`timelineConsistency.ts` 检出同一角色同刻异地、出生后登场、伏笔回收早于埋设、章节指向不存在事件，全部为本地规则，不调用模型。

## 剧本

- 入口：世界分区「剧本」开关卡，组件为 `src/renderer/features/screenplay/ScreenplayPanel.tsx`。
- 结构：每个场次为一个章节，标题即场次标题。
- Fountain 互操作：`screenplayModel.ts` 用 `fountain-js` 解析 Fountain，序列化回 Fountain；导入把场次追加为章节，导出把章节写成 Fountain 文件。
- 类型模板：核心类型注册表含 `script.screenplay`、`script.scene`、`storyboard.shot`、`bible.entry`。

## 维护建议

- 检查规则与语义相似逻辑继续沉到 `services`
- 可视化组件保持展示职责，避免掺入过多数据清洗逻辑
- 新增世界设定能力时优先按主题放入 `world`、`timeline` 或 `consistency`
