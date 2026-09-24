# 14 助手进阶：图片附件、计划模式、后台执行、MCP 客户端

## what

1. **图片附件**：聊天附件支持 png/jpg/webp（大小上限 5MB，超限提示压缩）；
   仅视觉模型可用（`supportsVision: false` 显式关闭才拦截，缺席按支持处理，
   主流对话模型均支持；可在模型设置关闭）；经网关图片消息形态传递
   （openai-compatible / responses / anthropic / gemini REST+SDK 按官方形态转写）。
2. **计划模式**：Agent 开关 `planMode`：首轮只出计划（步骤清单）→ 用户批准后
   执行；拒绝回聊天。复用审批三档（plan 走 proposal）。
3. **后台执行**：`isLoading` 按会话拆分（多会话各跑各的，顶栏全局停止键保留）；
   本轮先做"会话级 loading + 停止"，不做跨窗口后台常驻。
4. **MCP 客户端**：设置页 MCP 服务列表（stdio 命令 + 开关 + 连通测试）；
   连通的 server 工具并入 ToolRegistry（`mcp.*` 命名空间，默认关闭）；
   多任务由应用级任务服务串行排队，顶栏指示进度并可中止。

## why

- 对标 Cherry Studio（图片/PDF 附件、MCP 列表）、codex `/plan`、
  OpenWebUI 多任务。现状：纯文本附件、无计划、无后台、无客户端。

## 验收标准

1. 单测：图片超限拦截；视觉关闭拦截；openai/anthropic/gemini 形态；
   计划批准/拒绝分支；MCP 全链路（mock stdio）/命名空间隔离。
2. 手工：一图一问可用；计划模式走完批准→执行；
   MCP server 连通后工具可调。
3. 不回归：`verify` 全绿；无图片/无 MCP 时行为不变。
