# 28 文档已写、代码未落地清单（时点快照）

本文件把设计/特性文档里"规划中、标注后续/待办"的内容与代码现状对账，逐条给状态，
供排期；不做长期正文，落地后从本表移除。审计时点为 2026-09（最近一次更新：完成 24 D2 等后）。

约定：`未做` = 文档已规划、代码无实现；`有意挂起` = 已评估并主动不做。

## 未做

| 来源 | 内容 | 现状 |
|---|---|---|
| `23-data-layer-storage.md` §6、`24` D3 | 正文以文件为源（每章一文件 + 清单校验，外部改单章可导入） | 正文仍在 SQLite `nodes.body`，无章节文件与清单（用户明确暂缓） |
| `24` D1 | 追加式事件日志（JSONL）为唯一真相源，SQLite 改为其投影、可重建 | 无事件日志源；SQLite 即真相（用户明确暂缓） |

## 已完成（从本表移除）

- `20-external-benchmark.md` 计划/待办：五阶段写作计划看板，随作品落盘（`features/plan/` + `Project.plan`）；泛用分组/卷（`features/groups/` + `Project.groups`/`Chapter.groupId`）。
- `24` D2 混合检索：FTS5 + 向量 **RRF 融合**（`shared/services/searchService.ts`，向量不可用退化为 FTS）。
- `18` 批次 F.13 类型注册表接 UI：未知类型经 `Project.extensions` 端到端往返（`core/project/bridge.ts`）。
- `04` §13.2 设置表单 `enum` 与嵌套对象（`shared/ui/SchemaForm.tsx`）。
- `25` §6 S5 恢复 UX：备份内容预览 + 条目级选择（`StorageSettingsPanel` + `BackupRestoreDialog`）。
- `features/plugins-and-sync.md`：编辑器解锁态透明解密显示（`EncryptedChapterView`）。
- `22` 编辑器 iframe 受控 https 联网（`permissions.network` 门，`PluginFrame`/`PluginEditorFrame` + 主进程 `plugin-fetch`）。
- `14` 助手后台执行 / 多任务：应用级任务服务串行排队 + 顶栏指示/中止（`assistantTaskService`）。
- `17` §7 文档附件：`attachments`/`blobs` 落地（按书持久化 + 助手附件库 `SavedAttachmentsButton`）。
- `12` 批量操作：书库多选批量删除/打标（`Bookshelf` 选择态 + `useBookActions.deleteBooks`）。
- `21` §5.5 供应链：`sha256`/`ed25519`/`cosign` 多算法签名信封 + 来源白名单（`plugins.allowedSources`）。
- 分区组件按需加载：工作台各分区 `React.lazy` + `Suspense`（减小首屏主包）。
- `18` 批次 E：`StepKnowledgeEnhanced` 拆出检索栏/统计/检索结果/世界要素编辑器子组件。

## 有意挂起 / 评估后不做

- 动态 `connect-src` 端点白名单（`27` §4）：端点用户自定义，静态白名单会误伤。
- MCP 独立 server 鉴权：stdio 子进程环境由启动方控制，token 无鉴别意义；已只读 + 客户端启动需原生批准。
- 多人协作 / CRDT / 分布式：在"不做清单"，非请勿动。

## 来源

- 上述设计文档与 `docs/features/`、`docs/guides/acceptance-report.md`。
