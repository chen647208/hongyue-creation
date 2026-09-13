# 29 通用创作平台：数据模型、时间线、视图与改造计划

本文件是通用化改造的总案（前瞻设计）。范围：从"小说工具"升级为"通用创作平台"——
实体类型与字段自定义、多视图、双轴时间线、类型模板、可开关界面，并为协作与外部同步留缝。
落地后把对应内容回写进 `docs/features/`。

## 1. 定位、原则与非目标

- 定位：试验田；核心只做数据模型与扩展机制，广度靠类型模板与插件。
- 原则：AI 是增强层（禁用全部插件与 AI 后纯创作完整可用）；一切变更走单一管线；
  一切界面与功能可独立开关；新文体走类型模板加发行档，不动核心。
- 非目标：实时多人协作（本期只留缝）；音视频成片剪辑与导出（发行档或插件）；平台发布、社区、收益。

## 2. 外部对照（试验田调研，时点 2026-09）

| 产品 | 可借鉴 | 判定 |
|---|---|---|
| 作家助手（阅文） | 卷章结构、多平台预览（读者视角实时排版）、一键排版、自动滚屏、快捷词、章纲提取、妙笔式 AI 入口、冲突提醒 | 交互与流程对标；其 AI 为外接模型，引擎不学 |
| Aeon Timeline | item types + fields + views 的通用模型；叙事视图与时间线视图分离；角色年龄与冲突检测 | 数据模型与双轴对标 |
| CapCut / 剪映 | 多轨、clip 段、播放头、吸附、关键帧、复合片段、缩放联动 | 时间线交互对标（只借设计） |
| Arc Studio Showrunner | 私有草稿、提交、逐条批准、并入主稿；指派与状态看板 | 异步协作（B 档）对标 |
| WriterDuet | 实时合写、多光标、评论、版本历史 | 实时协作（C 档）对标 |
| 剧云 / 花生剧本 | 场次管理、评论批注、权限分级、版本对比、终稿锁定 | 中文剧本协作对标 |
| Yjs / Automerge / Loro | 文本 CRDT / 文档型 CRDT / 高性能 CRDT | 协作留缝的选型参考 |

库选型（依赖许可为 MIT 或宽松）：

| 能力 | 选型 | 许可 | 说明 |
|---|---|---|---|
| 拖拽 | `@dnd-kit/core` + `sortable` + `modifiers` | MIT | 社区标准，可访问性内建，支持多容器 |
| 表格视图 | `@tanstack/react-table` | MIT | React 19 兼容，模型与渲染分离 |
| 虚拟化 | `@tanstack/react-virtual` | MIT | 长列表与时间线 clip 虚拟化 |
| 正文编辑 | `@tiptap/*`（现有） | MIT | ProseMirror 底座，已有 8 原语与 DSL |
| 结构化文本 | `@codemirror/*`（现有） | MIT | 大纲与卡片区 |
| 关系图 | 自研（现有 `WorldViewGraph` + `graphLayout`） | — | 需要双向自定义布局；后续按需评估 `@xyflow/react` |
| 剧本互操作 | `fountain-js` | MIT | Fountain 解析，导入导出标准剧本 |
| 日期与时长 | `date-fns` | MIT | 时间线刻度与相对时间 |

时间线组件自研 headless：现有 Gantt 库（`@svar-ui/react-gantt`、`roadline`、`schedra`）以任务调度为形状，
与本项目的双轴（叙事顺序 × 故事时间）剪辑式时间线不匹配；借用 CapCut 的 track/segment/keyframe 结构设计。

## 3. 通用数据模型（schema v5）

现有 `nodes / edges / attrs / attachments / blobs / revisions` 已接近通用，改造集中在
"类型与字段提升为一等公民 + 视图与顺序层"。

| 概念 | 落地 | 职责 |
|---|---|---|
| Work | 现 `Project` 泛化 | 项目根，带 `templateId` 与 `profile` |
| Node | 现 `nodes` | 卷/章/场景/卡片/事件等文档单位 |
| ItemType | 引入 `item_types` | id、label、icon、color、parentType、allowedViews |
| Field | 引入 `fields` | 挂 ItemType：key、label、dataType、options、required、default |
| 字段值 | 现 `attrs` | 自定义字段读写，无需新表 |
| Relation | 现 `edges` | 事件连接、因果、伏笔、人物关系 |
| Sequence | 引入 `sequence_items` | 叙事顺序位（可拖拽重排） |
| 故事时间 | `attrs`（`storyTime`/`importance`/`duration`） | 支持相对、未知、倒序 |
| Asset | 现 `attachments/blobs` | 素材与附件 |
| ViewConfig | 引入 `views`（用户级） | 视图类型、筛选、分组、列、轨道、缩放 |

字段类型：`text` / `number` / `date` / `option` / `checkbox` / `relation` / `image` / `link` / `tag`。

迁移：schema v5；沿用 `snapshotBeforeMigration` 先做热备份；旧数据回填为内置"小说"类型；
JSON 后端同步实现降级路径；迁移失败不启动。

## 4. 时间线

### 4.1 双轴

- 轴 A 叙事顺序：呈现顺序（第一章到第 N 章），可拖拽重排。
- 轴 B 故事时间：事件发生时间，可反向（倒叙）、可为相对或未知。
- 视图可按任一轴排序，也可并排显示；两轴之间以连接线指出"此章讲述更早发生的事件"。

### 4.2 连接

`edges.type` 取值：`causes`（因果）、`parallels`（并行）、`foreshadows`（伏笔）、
`depicts`（场景→所述事件）、`involves`（事件→角色/地点）。

### 4.3 大事件、小事件与合并

- 字段 `importance: major | minor`。
- 缩放分层：缩小时只呈现大事件，放大时展开小事件。
- 合并：小事件并入大事件（`contains` 关系或复合片段），可展开折叠；只改变视图聚合，不改事实。

### 4.4 一致性检查（纯函数，无 AI 可跑）

角色同一时刻出现在两地、年龄与事件冲突、伏笔先于埋设、事件被讲述早于发生。

### 4.5 交互（借剪映）

多轨（维度为线索/角色/伏笔/张力）、clip 拖动与跨轨、播放头处分割、两端裁剪、
播放头（阅读位置）、缩放（滑块加 Alt 滚轮加多轨联动）、吸附与主轨磁吸、标记（节拍/伏笔）、
关键帧（张力与节奏曲线）、分组与复合片段。

## 5. 视图引擎

同一份数据多视图：时间线（双轴）、叙事卡片/大纲、表格、关系图、正文编辑器、读者预览。
视图由 `ViewConfig` 描述（类型、字段、筛选、分组、列、轨道）。字段可拖到列或轨道，
实体类型可拖到视图；面板开合、顺序与尺寸按用户持久化。

## 6. 可开关系统

三层叠加，均纳入同一开关树：

1. 编译期：发行档决定内置模块。
2. 用户级功能开关：模块带 `id` / `defaultEnabled` / `profileGate`，界面只渲染启用项。
3. 视图与布局开关：面板、字段、轨道、列可开合与重排，按用户保存。

插件贡献的功能与视图进入同一开关树，权限默认拒绝。

## 7. 类型模板与发行档

- 模板 = ItemType + Field + 视图组合 + 默认分区 + 种子内容。内置：小说、剧本、设定集、分镜、动态漫脚本。
- 发行档 = 编译期能力集（沿用现有 release profile）。
- 剧本：场次结构 + 自动格式化 + 分场大纲；Fountain 互操作；单人可用。

## 8. 协作与同步留缝

分档：

| 档 | 场景 | 机制 |
|---|---|---|
| A 同人多端 | 一人多设备 | bundle / 文件夹 / 云盘传输，冲突副本 |
| B 多人异步 | 编剧团队与工作室 | 工作副本、批注、审阅批准、角色权限、定稿锁定 |
| C 多人实时 | writers' room 同屏 | CRDT（Yjs）/ 中继 |

C 档已落地（Yjs）。A 与 B 保留以下缝合点：

- 所有写操作走单一命令层（操作日志），可直接作为 op-log 或分支合并输入。
- 稳定 id（`uuidv7`）与 actor 占位。
- 保留 provenance（`revisions` 的 author/cause 与 `agentId`）。
- 冲突副本语义可升级为分支与合并。
- transport 抽象（`SyncTransport`）：文件夹、WebDAV、S3、云盘目录按需加实现。
- 决不同步活着的 `hongyue.db`；云盘只同步导出的 bundle、文件夹镜像或归档包。
- 选型：同一人异步多端以 Automerge 为候选；实时协作用 Yjs；均 MIT。

## 9. 分期计划

| 期 | 名称 | 交付 | 验收 |
|---|---|---|---|
| P0 | 定稿 | 本文件 + 索引更新 | 文档评审通过；文风 grep 清零 |
| P1 | 通用模型 v5 | `item_types` / `fields` / `views` / `sequence_items` 表、迁移、attrs 读写、小说类型回填 | 迁移幂等、快照可回滚；小说全流程回归绿 |
| P2 | 视图引擎与开关 | `ViewConfig` 渲染层（表格/卡片/图/时间线占位）、功能开关树、布局持久化 | 同一数据多视图一致；关闭功能无残留 |
| P3 | 时间线 | 双轴多轨时间线（clip、播放头、缩放、吸附、连接、大小事件、合并、一致性检查） | 拖拽重排只改叙事顺序；倒叙正确；检查项可复现 |
| P4 | 类型模板 | 剧本（场次与自动格式、Fountain）、设定集、分镜 | 各模板单人可用；与核心解耦 |
| P5 | 数据出口与留缝 | J1 命令层与操作日志、J2 外部文件夹与云盘、草稿与定稿锁定 | 外部改单章可导入；关闭无残留；日志可诊断 |
| P6 | 实时协作 | Yjs 协作文档（章节 `Y.XmlFragment`）、同机 `BroadcastChannel` 与主进程 WebSocket 中继、在线状态与远端光标 | 双端编辑收敛；关闭后无残留 |

并行穿插：作家助手 parity（多平台预览、一键排版、自动滚屏、快捷词、纠错、成稿导出），
建议与 P2 之后交织，因其依赖视图与字段及预览投影。

## 10. 横切约束

- 迁移安全：v5 前自动热备份；失败不启动；旧格式以 `.legacy` 保留。
- 性能：clip 与列表虚拟化；画布渲染缩略图；大书分页加载。
- 测试：纯函数（一致性检查、排序投影）、两套 SQLite 引擎往返、E2E（时间线拖拽、视图切换、开关）。
- 文档：Diátaxis 落位；功能改动同步 `docs/features`。
- 许可证：依赖须 Public Domain / MIT / Apache-2.0；copyleft 只借设计不抄代码。

## 11. 风险与不做

| 风险 | 缓解 |
|---|---|
| 过度泛化导致复杂 | 模板与默认值兜底；小说仍是一等 |
| 时间线对长篇作者是负担 | 可选视图，按模板启用，不作主入口 |
| 重构丢数据 | 快照、迁移幂等、`.legacy` |
| 范围失控 | 插件与发行档之外的功能不进核心 |

不做：平台发布与社区与收益、音视频成片导出（除发行档）。

## 12. 来源

- 作家助手：https://zuojia.write.qq.com/ 与 https://www.yuewen.com/app/?type=appzj
- Aeon Timeline：https://www.aeontimeline.com/
- CapCut / 剪映：https://www.capcut.com/ 与 https://developer.cloud.tencent.com/news/2321265
- Arc Studio：https://www.arcstudiopro.com/showrunners
- WriterDuet：https://www.writerduet.com/
- 剧云：https://www.jucloud.com/
- 花生剧本：https://www.b413.com/sites/390976.html
- Yjs / Automerge / Loro：https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026
- dnd-kit：https://dndkit.com/
- TanStack Table：https://tanstack.com/table
- TanStack Virtual：https://tanstack.com/virtual
- fountain-js：https://github.com/jonnygreenwald/fountain-js
