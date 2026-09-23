# 红月创作 v2 设计文档索引

> 生成于 2026-08-31 ｜ 依据：起点代码实测（01 篇，时点快照）+ 九项目调研拆解（novelWriter/Zettlr/Trilium/Twine/Manuskript/bibisco/codex/deepseek-harness/编辑器内核与插件规范；调研归档于 git 历史 research/ 目录）。
> **性质声明**：本目录是目标设计（前瞻性），与 `docs/features/`（现状描述）分工不同；功能落地后应把对应设计回写进 features 文档。

## 阅读顺序

1. **[01 起点基线](01-current-state.md)** — 蓝图绘制前的代码底色快照：技术栈、数据模型、44 个服务、与蓝图的差距矩阵（附当前处置对照）
2. **[02 目标架构](02-target-architecture.md)** — 进程模型、core 分层与导入边界、目标目录树、状态管理决策
3. **[03 数据层](03-data-layer.md)** — 六实体、类型注册表（首批 17 模板）、开放文本 DSL、索引器、schema v2、迁移框架
4. **[04 插件系统](04-plugin-system.md)** — manifest v0、9 类贡献点、生命周期与故障隔离、命名空间、沙箱、bundle/profile/patch
5. **[05 AI 层](05-ai-layer.md)** — 工具注册表（10 内置工具）、写法技能引擎、审批三档、会话事件流、MCP 双向
6. **[06 编辑器与 UI](06-editor-and-ui.md)** — TipTap+CM6 双内核、单一变更管线、8 个写作原语、UI 宪法、应用壳
7. **[07 导出](07-export-build.md)** — Build Profile 四命名空间、选择→变换→渲染管线、插件渲染器
8. **[08 路线图](08-roadmap.md)** — M0–M5 工作包分解、退出标准、横切策略、风险登记（**取代 11 篇的迁移粗排**）
9. **[09 Agent 后续项](09-agent-followups.md)** — MCP 落库/技能点名/用量可见三项的 what/why/验收标准
10. **[10 流程与数据欠账](10-flow-and-data-debt.md)** — 手写豁免/专注返回/斜杠审批/数据枚举化四项立项，不重写的还债结论
11. **[18 规范化重构](18-standardization.md)** — 组件化、代码标准、插件化的总案与批次规划
12. **[19 UI 系统机制](19-ui-system.md)** — 组件清单单源、状态四态、对标评审、无障碍、AI 起草五条机制
13. **[20 外部对标](20-external-benchmark.md)** — 16 个项目逐项剖析、分类结论与来源汇总
14. **[21 插件沙箱](21-plugin-sandbox.md)** — 隔离层级、候选方案（WASM/QuickJS/V8 isolates）与推荐架构
15. **[22 插件逻辑贡献协议](22-plugin-logic-contributions.md)** — editor 扩展与逻辑 hooks 的执行通道、协议与验收
16. **[23 数据层存储选型](23-data-layer-storage.md)** — 文件/数据库/日志的边界与按类分层设计
17. **[24 本地优先数据层](24-local-first-data-layer.md)** — 2026 格局调研与事件溯源选型
18. **[25 数据安全](25-data-safety.md)** — 威胁模型、防护分层、引擎决策与验证方式
19. **[26 成熟度缺口清单](26-maturity-gaps.md)** — 全维度审计的时点快照与分批修复计划
20. **[27 IPC 信任边界加固](27-ipc-hardening.md)** — SQL 语义通道、文件 IPC 收敛与 CSP 决策
21. **[28 文档已写、代码未落地清单](28-doc-impl-gaps.md)** — 设计/特性文档与实现的对账时点快照
22. **[29 通用创作平台](29-general-creation-platform.md)** — 实体类型与字段自定义、双轴时间线、多视图、类型模板、可开关界面与分期改造计划
23. **[30 惰性载入](30-lazy-node-loading.md)** — 骨架载入、活动书补载、释放策略
24. **[31 存储后端切换与哨兵](31-storage-backend-migration.md)** — 后端哨兵、阻断提示与 local→OPFS 单向迁移
25. **[32 AI 写入治理](32-ai-write-governance.md)** — 提案 diff 与权限边界
26. **[33 动效规范](33-motion.md)** — 允许/禁止、可访问性与实现约定
27. **[34 创作域能力矩阵](34-creation-domain-matrix.md)** — 通用件定位、各创作域 A/S 档位与缺口总表
28. **[35 跨设备与移动端](35-cross-device-and-mobile.md)** — 移动只读与轻编辑、窄视口与数据路径
29. **[36 数据同步与冲突](36-data-sync-and-conflict.md)** — 同步包落库修复、WebDAV/S3 传输、冲突与恢复提示
30. **[37 AI 上下文注入与可信检索](37-ai-context-and-grounding.md)** — 关键词命中注入、预算与溯源逐字校验
31. **[38 修订、批注与关联](38-revision-annotation-and-linking.md)** — 逐处接受/拒绝、行内批注、反向引用、登场章节与章纲提取
32. **[39 编译与导出](39-compile-and-export.md)** — 编译目标与模板、ODT、分镜表与口播输出
33. **[40 生态与运行时能力](40-ecosystem-and-runtime.md)** — 插件分发、多助手会话、MCP 资源面、联网搜索/翻译、本地推理
34. **[41 非虚构与引用](41-nonfiction-and-reference.md)** — 引文/脚注/参考文献、对照视图
35. **[42 分支叙事与绘本](42-branching-and-picturebook.md)** — 分支与变量、完整性校验、图位与页
36. **[43 无障碍与国际化品质](43-accessibility-and-i18n.md)** — 全量 axe、对比度 AA、中英对齐校验
37. **[44 创作范式地图与跨域能力](44-paradigms-and-cross-domain.md)** — 各领域范式地图、跨域可迁移机制、本仓落点与分档
38. **[45 查询、块引用与素材隔离](45-query-blocks-and-materials.md)** — 保存的动态视图、块级引用与嵌入、素材隔离
39. **[46 时间线深化与版本](46-timeline-and-versioning.md)** — 非破坏操作、草稿矩阵与成稿轨道、试错快照与正式历史
40. **[47 跨域视图与脚本层](47-cross-domain-views-and-scripting.md)** — 图 DSL 视图、可编程画布、图表视图、宏/脚本层
41. **[48 后续任务总表](48-backlog.md)** — 34–47 的缺口按依赖与收益排序、分阶段执行
42. **[49 可执行插件描述符协议](49-executable-plugin-protocol.md)** — 渲染器/脚本描述符、能力白名单、同步渲染契约与沙箱边界
43. **[50 键位自定义与缩放接管](50-keybindings-and-zoom.md)** — 缩放单口径（界面字号）、快捷键命令目录与用户改键、localStore 持久化与冲突/保留提示

## 一页纸总览

```
现状：textarea + 单文档 JSON(已有 repository 抽象) + 硬编码 AI + 683 行 useState 根组件
目标：六实体+类型注册表(数据) → DSL 文件为源+索引缓存(存储) → 双内核+事务管线(编辑)
      → 工具+技能+审批( AI ) → manifest+贡献点+隔离运行时(插件) → bundle/profile 发行(生态)
路径：M0 数据地基 → M1 编辑器 → M2 AI → M3 插件化(v2.0) → M4 表面 → M5 生态
不变：i18n/主题/Radix/Tailwind/CI/许可证治理/5 模型适配器/repository 抽象 —— 全部保留演进
```

## 五条设计公理（裁决一切争议，出处 10 篇架构总纲）

1. 纯文本为源，索引为缓存
2. 实体极少，语义靠约定
3. 一切变更走单一管线
4. 扩展永远非必需（禁用全部插件/AI 后纯写作完整可用）
5. 规范先于生态
