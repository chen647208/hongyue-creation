# 09 Agent 后续项

依据：OpenCode `steps` 语义（默认无限、末轮硬切文本）与缓存拆分（稳定/动态前缀、
工具 schema 稳定）已在轮数与缓存改造中落地；本篇收敛审计剩余的三处断链。

## A. MCP 提案批准后真实落库

- 现状：`src/main/mcp/server.ts` 的 `propose_card_write/propose_chapter_write`
  只把标题与正文写入 `pending-proposals.jsonl`，完整参数（bookId/nodeId/type）
  丢失；`ApprovalHost` 批准仅删除待审项，无任何落库动作。
- 目标：批准即生效，与内置 Agent 同权同源。
  - `server.ts` 落盘保留完整执行参数；`ApprovalProposal` 加可选 `exec` 字段
    （`{ kind: 'chapter-write' | 'card-write', bookId, nodeId?, type?, title, body }`）。
  - 渲染端新增执行器：章节写按节点 id（与章节 id 同源，见 bridge 平铺集）
    定位，先补快照再更新正文；卡片写先走卡片命令解析，失败回落知识库追加，
    全程标注 `agentId: 'ai:mcp'`。
  - 目标书不是当前活动书时先切换过去再落库（用户亲眼看到变更落点）；
    目标书或章节不存在时不删待审，给出明确提示。
- 验收：外部 agent 提案 → 待审箱批准 → 对应章节正文/卡片真实变更且可回退；
  目标缺失时待审保留并提示；单测覆盖执行器三条路径。

## B. 技能清单可见与白名单生效

- 现状：`SkillCatalog.manifest()`、`Skill.tools`、`activate()` 返回值生产零消费；
  模型看不到技能清单，技能自带工具白名单不生效，触发词只在会话启动匹配一次。
- 目标：对齐 SKILL.md 渐进加载语义（清单常驻，全文按需）。
  - 新增 `skillManifest` section（order 45）：经 `extra.skillManifest` 注入清单，
    模型可按名请求。
  - 新增 `core.skill.load` 工具（会话内状态变更，不碰数据，read 档免审批）：
    按名激活技能；`AgentLoopDeps.context()` 改为每轮重取，激活对后续轮次生效，
    顺带修复索引快照整会话不刷新的问题。
  - 激活技能带 `tools` 白名单时，非白名单调用直接拦截并回填说明，不执行。
- 验收：装配 prompt 含技能清单；`core.skill.load` 激活后白名单拦截生效；
  轮次间上下文新鲜；单测覆盖三项。

## C. 会话用量汇总展示

- 现状：`llm.done` 携带的 tokens（含缓存读写计数）只躺在 jsonl 里，
  事件浏览器逐行展示事件名，无任何汇总；`AIResponse` tokens 类型丢弃缓存字段。
- 目标：用量可见、可归因。
  - 共享 `AIResponse` tokens 加可选 `cacheRead/cacheWrite`。
  - `sessionArchive.ts` 加纯函数 `summarizeSessionUsage(events)`：
    累计 prompt/completion、缓存命中读数、工具调用次数。
  - 事件浏览器展示单会话汇总条与每轮 `llm.done` 用量行，中英字典对齐。
- 验收：历史会话可见总量与缓存命中；单测覆盖汇总函数（含缺字段事件）。
