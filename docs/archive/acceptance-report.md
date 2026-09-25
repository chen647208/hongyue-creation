# 设计验收报告（2026-09 时点快照）

> 逐项核对各设计篇验收标准的落地状态。证据 = 提交哈希 + 测试名；
> 测试全部随 `npm run verify` 运行（lint + typecheck + vitest + 许可头 + Electron 构建）。
> 本文是时点快照：此后新增能力不回填此处，当前状态以 `docs/features/` 为准。

## 05 AI 层（§8 五条）

| # | 标准 | 状态 | 证据 |
|---|---|---|---|
| 1 | 断网/无 Key：纯写作正常，AI 按钮提示未配置原因 | ✅ | 网关错误一律经 `AIResponse.error` 返回；minimal 发行档整体拒绝 AI 请求（2354e7d，`ai.request` 拦截门） |
| 2 | AI 改稿全链路留痕：tool call → proposal → diff → 审批 → transaction → Revision → entity_changes(agentId) | ✅ | 会话事件 `tool.call/tool.approval/tool.result` 落 jsonl（20bb6f8）；`ApprovalRouter` write:direct 审计回调（8b3081b）；`CommitOptions.agentId` 写入 entity_changes 与 Revision（见 08 篇 M1.3）；callId 贯穿三级 |
| 3 | 技能渐进加载：清单 <500 token，激活全文注入可卸载 | ✅ | SkillCatalog manifest 预算 1600 字（≈500 token 中文）+ 测试（0feb8c6） |
| 4 | MCP 出口：外部 agent 完成「读大纲→改人物卡→写回」 | ✅ | stdio server 冒烟实测（list_books/get_node/propose_card_write，7a2b8ea）；写走待审箱桥（ApprovalHost 轮询） |
| 5 | 审批超时不阻塞：挂起待审箱，UI 角标 | ✅ | ApprovalBroker 超时降级测试（8b3081b）+ ApprovalHost 角标（d72b8cb） |

## 07 导出构建（§5 四条）

| # | 标准 | 状态 | 证据 |
|---|---|---|---|
| 1 | 双 profile 产出正确差异 | ✅ | 投稿版/设定集测试（c02fa95） |
| 2 | profile 往返无损 | ✅ | roundtripProfile 测试 |
| 3 | 插件贡献变换器 + 渲染器不改内核可选用 | ✅ | reverse-order 变换器 + rtf 渲染器测试（注册表为公开贡献点） |
| 4 | 导出字数与统计面板一致（同源） | ✅ | `builtCharCount`（ab8cc0b）：统计面板与导出共用 `runBuild` 管线文本，同源断言测试 |

## 04 插件系统（§10 五条）

| # | 标准 | 状态 | 证据 |
|---|---|---|---|
| 1 | manifest 校验错误定位 JSON 路径 | ✅ | validateManifest 测试（adcb768） |
| 2 | 故障隔离：坏插件不影响其余 + 状态面板 + 一键禁用 | ✅ | PluginHost 测试 + 插件设置页签（6159367） |
| 3 | unwind：禁用后注册消失、启用恢复 | ✅ | Disposable 逆序释放测试 |
| 4 | 命名空间冲突各自前缀化 | ✅ | typeTemplateId/commandId 测试 |
| 5 | 未声明 write → PermissionDenied 且 cause 链完整 | ✅ | assertPermission + toPluginError 测试 |

## 06/08 范围内新增（超出原验收的交付）

- 同步地基：bundle 导出/导入 + 冲突副本合并（b2b702b/f9efabf），LWW 禁用
- 逐条目加密：AES-256-GCM protected session + 逐章加密/解密 UI（7339a8e/aac6759）
- VS Code novelDsl 语法扩展（d6cfb55）；VitePress 文档站（48453a4）
- 发行档运行时强制：minimal 档 `ai.request` 整体否决（2354e7d）

## 已知边界（后续迭代）

- 15 feature 的组件级 bundle 重构：声明与装配树已就位，组件逐个迁移随 dogfood 推进
- 加密与辅助窗口（导出预览/一致性报告独立窗口）可继续深化
- AIHistoryRecord 兼容视图按设计保留一个版本周期，事件流浏览器为其替代
