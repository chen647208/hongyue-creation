# AI 调用层架构

AI 调用采用「主进程网关 + 渲染端客户端 + 工具/审批/会话」四层（design/05）。
适配器协议实现位于**主进程** `src/main/ai/`，API Key 不进入渲染端。

## 分层

```
┌ 技能层   SkillCatalog（SKILL.md 渐进注入）──────── src/core/ai/skills.ts
├ 编排层   ToolRegistry / AgentLoop / ApprovalRouter ── src/core/ai/
├ 网关层   AiGatewayProvider（主进程）──────────────── src/main/ai/
└ 协议层   会话事件流（jsonl）+ MCP 双向 ───────────── src/main/mcp/ + core/ai/session
```

## 主进程网关（src/main/ai/）

- `gateway.ts`：AiGatewayProvider——IPC `ai:complete` / `ai:stream:open` /
  `ai:stream:event` / `ai:stream:abort`；流式按 requestId 多路推送；
  不支持流式的模型降级为一次性补全（结果块带 notice）。
- `adapters/`：anthropic / gemini（原生 + OpenAI 兼容端点 + SDK）/ openai-compatible
  （含 ollama）/ openai-responses 四适配器 + `sse`（增量解析）/ `retry`
  （指数退避、Retry-After）/ `messages`（构建/清洗/用量提取）。
- 缓存：anthropic 在 system 块与末条 user 消息打 ephemeral 断点（对标 OpenCode，
  Agent 循环前缀稳定可复用，用量透出 cacheRead/cacheWrite）；
  openai/gemini 走服务端自动前缀缓存，无需客户端标记。
- `i18n.ts`：主进程独立 i18next 实例（errors 命名空间），字典与渲染端同源
  `src/shared/i18n`。

## 渲染端（src/renderer/shared/services/ai/）

- `gatewayClient.ts`：类型化客户端（渲染端唯一出口）。契约：
  complete/stream 不抛错，失败经 `AIResponse.error` / 最终 onChunk 块返回。
- `json.ts`：`callJSON` 结构化输出 + 修复重试（validate 函数不可跨 IPC，
  编排留在渲染端）。
- `AIService` 门面（features/assistant/services/aiService.ts）：静态 API
  `call / callStreaming / callJSON / testConnection`，内部委托网关客户端。

## 线上契约

- `AiCallOptions { retries }` 跨 IPC；AbortSignal 不跨进程——取消经
  requestId 走 `ai:stream:abort`。
- 流式 `onChunk` 的 `content` 为**累计全文**，完成时 `isComplete = true`；
  降级 notice 经最终块 `notice` 字段透传。
- `AiStreamEvent`：delta（累计值）/ done（最终块）/ error，按 requestId 分发。

## Agent 循环与工具（src/core/ai/）

- `agentLoop.ts`：assemble（PromptAssembler）→ llm → 解析
  `{reply, toolCalls}` JSON 协议 → 审批（三档）→ execute → 观察回填 → 循环。
- `tools.ts`：ToolRegistry（17 个 `core.*` 内置工具 + 插件贡献）；permission 三档。
- `approval.ts`：ApprovalBroker（超时降级待审箱）+ ApprovalRouter。
- `session.ts`：AiEvent 事件流落 `ai-sessions/<bookId>/*.jsonl`。
- `skills.ts`：SKILL.md 渐进注入（清单预算、激活/卸载、触发词匹配）。

## 上下文注入与可信检索（design/37）

- 注入引擎 `contextInjection.ts`：按目标（当前章节 / 选中实体 / 任务关键词）装配正文片段、细纲、前情、相关设定与时间线事件；每条标注来源（kind / refId / title / locator）与触发原因。
- 预算单源 `src/shared/constants/aiContext.ts`：超预算按优先级裁剪并记录被裁条目；引用型片段注入前与原文逐字比对，不一致的剔除并标出。
- 开关：`injectionEnabled=false` 不做任何注入（回到手动）；单条经 `disabledInjectionIds` 关闭。装配顺序为世界观之后、索引摘要之前（section id `contextInjection`）。
- 可信检索 `grounding.ts`：检索命中规范化为带出处的引用（锚点 `chapter:<id>` / `knowledge:<id>`）；空结果返回明确「未找到」措辞，禁止编造。工具 `core.text.search` / `core.text.semanticSearch` 返回 `found` / `citations` / `text`。
- 界面：助手答复的引用与正文分栏呈现，出处可点跳回来源；自动注入面板列出条目、来源与预算占用，可整体关闭或逐条取消。
- 事件：`context.injection` 记录本次注入条数、预算占用与被裁条数。
- 当前章节目标由会话入参 `contextTarget` 传入；助手按任务文本推断（`inferContextTarget`）。编辑器未向助手暴露活动章节，跨面板选择待接。

详细交互规范见 `design/05-ai-layer.md` 与 `design/04 §3.1`。
