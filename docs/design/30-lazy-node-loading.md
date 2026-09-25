# 30 按需载入正文（惰性加载）

## 背景与问题

当前桌面启动时 `nodes.selectAll`（`SELECT *`）把全部书的全部正文一次性载入内存，书多/字多时冷启动变慢、常驻内存与每书索引重建成本线性增长。源于性能审计项（`docs/archive/26-maturity-gaps.md` 第 1 节）。

## 目标

- 冷启动只载入**书目元数据 + 章节骨架**（id/标题/摘要/顺序/状态），不载入正文。
- 打开某本书时再载入该书正文；切换书触发载入/释放。
- 未打开的书在需要正文的场景（导出、统计、一致性）按需 hydrate，不依赖“全局都在内存”。
- JSON 回退后端保持现状（本就是内存态），不受影响。

## 非目标

- 不引入分页/游标式大章节切分（单章仍整段载入）。
- 不改插件/AI 的读取路径（仍走 store，store 负责 hydrate）。

## 设计

1. 仓储接口扩展：
   - `loadBookSummaries?(): Promise<{ projects: ProjectShell[]; activeProjectId }>`（节点不含 body）。
   - `loadBookContent?(bookId): Promise<Project>`（含正文，必要时含修订/附件引用）。
2. `AppState` 增加 `ProjectShell`：`chapters` 只保留骨架，`content` 置空；`hydrated: false` 标记。
3. `projectStore`：
   - 启动 hydrate 只灌 shell。
   - `setActiveProject(bookId)` 触发 `loadBookContent` 并合并进 store，置 `hydrated: true`。
   - 释放策略：非活动书保留 shell，正文按 LRU（默认保留最近 3 本）可释放。
4. 依赖全量正文的调用点改为“先 ensureHydrated(bookId)”：
   - `persistDiff`：仅活动书写 body；未 hydrate 的书跳过正文比对。
   - 导出/统计/一致性：进入前 ensureHydrated。
5. FTS/向量检索在主进程/索引侧，不受内存状态影响。

## 迁移与回滚

- 纯读取路径变更，不改变库结构；无需数据迁移。
- 回滚：删除惰性路径即退回全量载入。

## 验收

- 冷启动不产生带 body 的 `nodes` 全表查询（可断言 SQL 调用）。
- 打开书后正文可编辑、保存、导出、检索一致。
- 切换 5 本书后内存中正文书数不超过 LRU 上限。
- `verify` 全绿，E2E 书库/工作台/写作回归通过。

## 风险

- 遗漏某调用点导致空正文写入（需以 `hydrated` 守卫，写前断言）。
- 插件直接读 `project.chapters[].content` 的路径需登记并同样 ensure。
