# 32 AI 写入治理：提案 diff 与权限边界

## 背景与问题

- `core/ai/agentLoop.ts` 的提案只带标题，不含将写入内容的 `diff`；内置写工具产出的正文不落库，审批通过后缺少可核对的变更与落库 Revision（审计项 `docs/archive/26-maturity-gaps.md` 第 5 节）。
- `core/plugin/runtime.ts` 已实现权限代理 `assertCan(pluginId, action, domain)`，但生产数据边界未调用，插件 hook 注入无越权拦截（同节）。

## 目标

- 写类提案携带 `exec`（结构化操作）与 `diff`（前后对比），审批界面可核对。
- 审批通过后，变更经既有 `saveProject(project, { agentId, cause })` 落库并写 `revisions`，与 `mcpProposalExecutor` 一致。
- 插件在宿主数据边界调用 `assertCan`；未声明权限即 `PermissionDenied`，hook 注入前校验。

## 非目标

- 不做可视化三方合并；diff 为文本行级。
- 不改审批三档（read 直通 / proposal 弹批 / direct 受限）。

## 设计

1. 提案结构扩展：`{ id, title, tool, exec: { kind, targetId, patch }, diff: Array<{ op: 'add'|'del'|'ctx', text }>, cause }`；`diff` 由目标章节当前正文与提案正文行级对比生成（纯函数，可测）。
2. 审批流：`ApprovalRouter` 在 `proposal` 档展示 `diff`；通过后交 `mcpProposalExecutor` 同构执行器：应用 patch → `saveProject(..., { agentId: 'ai:<tool>', cause })` → 写 Revision。
3. 权限边界：宿主在以下边界调用 `assertCan(pluginId, action, domain)`：
   - 事件拦截器（`events.intercept`）放行前的数据读写。
   - `runPluginLogic` 执行前按其 manifest 声明的能力集校验。
   - 未声明或越界 → `PermissionDenied`，返回 `{ ok:false, error:{ kind:'permission' } }`，不进入沙箱。
4. 域（domain）取值：`ai`、`editor`、`project`、`fs`；manifest `permissions` 声明 `{ action, domain }` 列表。

## 验收

- 提案在审批前可见 diff；拒绝后库与 Revision 不变。
- 通过后 Revision 的 `author='ai:<tool>'`、`cause` 记录 toolCallId/commandId。
- 未声明权限的插件 hook 被拒并留日志；已声明者正常。
- 单测：diff 生成、patch 应用、assertCan 拒绝/放行。

## 风险

- 误判权限导致既有插件失效：迁移期对内置插件显式声明所需域。
- diff 体积：仅活动章节、限长截断。
