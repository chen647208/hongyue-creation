# 代码质量审查报告（2026-09-25 时点快照）

> 三路并行审查（主进程与安全面 / 渲染层与状态 / 测试与构建）覆盖全部 src 代码；
> 高严重度结论均经源码人工复核。修复随 51 篇（安全）与各专项提交落地；
> 本文是时点快照，当前状态以 `docs/features/` 为准。

## 总评

- 强项：SQL 面全参数化（语句目录 + 未知 id 白名单拒绝）、插件沙箱双层隔离（QuickJS 限额 + utilityProcess 墙钟兜底）、零 TODO/零 `as any`、console 单出口、测试无水分（零快照滥用、零空壳断言）、i18n 字典 zh/en 零漂移、错误边界双挂载。
- 弱项：主进程安全门的**授权写路径**暴露给渲染层（51 篇收口）、渲染层纯逻辑服务测试欠账、硬编码色值与绕过 i18n 的中文字符串、五个 700+ 行多职责组件。

## 已修复（51 篇安全专项）

| 问题 | 位置 |
|---|---|
| 信任公钥清单可被渲染层整体替换 | providers.ts `pluginTrustedKeysSync` |
| sha256 自报摘要绕过「可执行插件必须签名」 | pluginStore.ts verifySignature |
| `fs:allow-path` 静默授权任意目录 | providers.ts |
| 沙箱限额渲染层入参无上限 | pluginSandbox/host.ts |
| 插件网络白名单渲染层可静默覆盖 | pluginNet.ts |
| `ai:http` 任意域代理 + Key 可拼 query | gateway.ts |

## 修复计划（按优先级，随各专项提交回写状态）

| # | 项 | 严重度 | 状态 |
|---|---|---|---|
| 1 | 绕过 i18n 的硬编码中文（GlobalAssistant prompt 与兜底文案、DslEditor、StepCharacters、StepOutline） | 高 | 待修 |
| 2 | 硬编码色值违反语义变量（aiCardCommandService、TimelineEditor、RuleSystemEditor、ExportChapterModal 预览） | 高 | 待修 |
| 3 | 巨型组件多职责（MultiViewPanel 911 行、WritingEditor 825 行、PluginSettingsPanel 756 行、ChapterHistoryModal 732 行、GlobalAssistant 718 行）；注入偏好双份真相 | 中 | 待修 |
| 4 | renderer 纯逻辑服务零覆盖（collaborationService、vectorService、embeddingService、smartRecommendationService）；mcp 目录被移出门禁但有测试 | 中 | 待修 |
| 5 | 源码注释违反「只写现在」规范 11 处 | 中 | 待修 |
| 6 | a11y.spec 11 处与 extended.spec 13s 盲等；e2e 9 处 `.nth()` 顺序依赖 | 中 | 待修 |
| 7 | `isPathAllowed` 不做 realpath；打包版 will-navigate 放行任意 file:；listDirectory 吞 IO 错误 | 低 | 待修 |
| 8 | eslint 不覆盖 e2e/scripts；UI 魔数（面板高度、复制复位延时）未收 constants | 低 | 待修 |

## 已核实无需处理

- `js-yaml ^5.4.2`：5.x 为 2026 年现行大版本，非笔误。
- 依赖告警 6 项（vite/esbuild/launch-editor）：均为 dev-server 面，不影响打包产物。
- 测试与日志产物（coverage/、test-results/、*.log）：已被 gitignore，未入库。
