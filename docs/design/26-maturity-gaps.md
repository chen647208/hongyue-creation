# 26 成熟度缺口清单（时点快照）

本文件是 2026-09 一次全维度审计的时点快照，用于排期修复，不做长期正文。
审计方式：五个方向只读排查（性能/可观测性、测试与 UI 状态、安全与供应链、数据层与发布/DX、AI 层与插件）。
修复落地后从本表移除，功能现状回写 `docs/features/`。

约定：`[H]` 高（数据安全/安全/正确性）、`[M]` 中、`[L]` 低。

## 未完成

| 严重度 | 位置 | 问题 | 收尾需要做什么 |
|---|---|---|---|
| M | 驱动契约测试 | json/wasm 驱动无共享契约套件 | 抽三后端共享契约套件 |

## 已完成（从本表移除）

- 性能：`bench` 脚本、落盘去抖、SQLite 差分 upsert + 批量 IPC、写作统计 `useDeferredValue`、书库 `content-visibility` 分页、存储配置缓存、JSON 去缩进、日志内存计大小、语义检索只回片段；`App.tsx` 书库屏（`BookshelfScreen`）自带 `projects` 订阅，工作台编辑不再整 App 重渲染；`loadAll` 只取骨架 + 活动书 hydrate（`docs/design/30`）；冷启动仅重建活动书派生索引，其余书打开时重建。
- 质量与无障碍：加载/导出失败提示与错误码判定、会话事件 i18n 与脱敏、gatewayClient 契约测试与流式空闲超时、备份/迁移单测、axe 棘轮、区域级 ErrorBoundary、SmartRecommender 错误态、插件设置损坏值保留、向量 IPC 入参校验与失败回报、模板名 i18n、VAULT 前缀单源、类型逃逸口径扩展；`e2e/extended.spec.ts` 补数据库损坏恢复与存储设置页用例；`sqliteRepository.test.ts` 补旧库 v2 fixture 升级到最新并保留数据。
- 安全与供应链：文件 IPC 路径收敛、SQL 语义通道、插件 fail-closed + 来源白名单、MCP inputSchema 校验、代理流空闲超时、Electron 沙箱沿用、许可证与 SBOM；插件签名公钥由主进程信任清单在 handler 内校验；模型拉表与向量嵌入经 `aiGateway.http` 由主进程解引用 Key，渲染端不经手明文。
- 数据层：桌面禁用自定义库路径、恢复快照前置、原子改目录、迁移前热备份、CI 打包矩阵、搜索常量单源、Node 版本约束；数据库热备份列出/校验/恢复面板；后端能力标志按能力隐藏按钮；备份与崩溃上报专篇；版本签名表述统一；存储后端哨兵 + 阻断提示 + local→OPFS 一次性迁移（`docs/design/31`）。
- AI 与插件：用量归因、直写审计、内容过滤错误分类、JSON 后端无修订标注、追加写、只读 MCP server、幂等键、`join('\n')`、`settingsSchema` 消费、WASM 示例；写类提案带 `diff` 与 `exec` 并在批准后落 Revision；`runPluginLogic` 执行前按 manifest 权限校验（`docs/design/32`）。

## 有意挂起 / 决策（不排期）

- 更新签名 `publisherName` / notarize：需先持有证书，见 `docs/design/27-ipc-hardening.md`。
- 动态 `connect-src` 白名单、`senderFrame` 来源校验、`.npmrc ignore-scripts`：`27` §4/§5 已记录决策（端点用户自定义、窗口禁导航/禁新窗口、postinstall 必需）。
- 崩溃转储加密：Electron `crashReporter` 无加密 API；默认只落本机、上传需显式开启且有告知入口，改为记录决策。

## 来源

- 上述设计文档与 `docs/features/`、`docs/guides/acceptance-report.md`。
