# 红月创作（Hongyue Creation）

**Hongyue Creation — a local-first desktop writing studio for novelists: AI when you want it, plain writing when you don't.**

红月创作是一款 Electron + React + TypeScript 桌面应用，覆盖从灵感、设定、大纲到成稿导出的完整创作流程。项目数据保存在本地，经 SQLite 单一事务管线与开放格式流转；禁用全部插件与 AI 后，纯写作依然完整可用。

![CI](https://github.com/chen647208/hongyue-creation/actions/workflows/ci.yml/badge.svg)

## 下载与安装

- 从 [GitHub Releases](https://github.com/chen647208/hongyue-creation/releases/latest) 下载对应平台的安装包。
- 支持平台：
  - Windows：x64 / arm64，NSIS 安装包。
  - macOS：x64 / arm64，DMG 与 ZIP。
  - Linux：x64 / arm64，AppImage 与 deb。
- 发布版是开箱即用的桌面程序，无需自行安装 Node.js；Node 仅在从源码运行时需要。

## 快速开始

1. 启动应用，按向导创建第一本书（可跳过，稍后从书库新建或选用模板）。
2. 在灵感分区输入想法，生成书名与简介。
3. 依次完成世界构建、角色与势力、结构（大纲 / 细纲），进入写作编辑器。
4. 需要 AI 时，在模型设置中配置渠道密钥；未配置时纯手写不受影响。
5. 成稿后从写作区导出，或按 Build Profile 生成交付稿。

从源码运行：

```bash
npm install            # 安装依赖（中国大陆可用 --registry=https://registry.npmmirror.com）
npm run electron:dev   # 开发模式（Vite + Electron）
npm run verify         # 本地与 CI 同一条校验链
npm run dist:win       # 生成平台安装包（另有 dist:mac / dist:linux）
```

## 功能概览

### 纯写作核心

- 五分区工作台：灵感、世界、角色、结构（大纲 / 细纲）、写作，全程自动保存。
- TipTap 正文画布 + CodeMirror 6 `novelDsl` 大纲编辑器，带 `@tag` 校验。
- 六实体数据模型（节点 / 边 / 属性 / 修订 / 附件 / 二进制）与类型注册表，统一承载书、章节、角色、世界、伏笔等条目。
- 时间线与版本：章节状态、批量操作、卡片视图、历史 diff、快照与回滚。
- 逐条目加密：AES-256-GCM 受保护会话，章节逐个加密 / 解密。

### 导出

- 导出格式：`md`、`txt`、`html`、`rtf`、`pdf`、`ePub`、`DOCX`、`ODT`。
- Build Profile（选择 → 变换 → 渲染）三段式管线，配置可 JSON / YAML 分享；导出预览与字数统计同源。

### AI 增强

- 主进程网关托管 API Key，Key 不进入渲染端；四类适配器（Anthropic / Gemini / OpenAI 兼容（含 Ollama）/ OpenAI Responses）+ 流式、取消、重试、结构化 JSON。
- 可接入 DeepSeek、Kimi、GLM、通义千问、MiniMax、Gemini、Claude、GPT 与 Ollama 本地模型。
- Agent 循环：分区装配提示词 → 工具调用（内置 `core.*` 工具，插件可贡献）→ 三档审批（建议 / 改写 / 直接），超时降级待审箱，绝不静默应用。
- 写法技能：`SKILL.md` 渐进注入（黄金三章、雪片法、POV、伏笔回收、AI 味消除等），社区可分发。
- 会话事件流全程 jsonl 留痕、可回放；MCP 双向接入，外部 agent 与内置助手平权，写操作走同一审批管线。

### 插件

- manifest 声明式贡献点、依赖拓扑激活、故障隔离、权限默认拒绝、事件命名空间强制。
- 资源型插件默认可用；逻辑型（JS / WASM）仅在同一签名校验 + 权限声明 + 沙箱限额内运行，未签名或越权一律拒绝。
- 插件状态面板与装配树查看器、发行档（完整 / 网文 / 严肃文学 / 纯写作，minimal 即时禁用全部 AI）；MIT SDK 独立发行。

### 同步、离线与移动端

- 本地优先：断网时写作、编排与导出全部可用。
- 同步包导出 / 导入，传输后端（本地目录 / WebDAV / S3 兼容）分片上传与断点续传；冲突以副本落库，本地原稿不动。
- 移动端 / PWA：窄视口（≤639px）单一内容列与底部导航，`manifest.webmanifest` 支持主屏安装。

### 无障碍

- 交互具备键盘等价与可读标签，面板纳入 axe 棘轮；尊重 `prefers-reduced-motion`。

## 文档

- 在线文档站：https://chen647208.github.io/hongyue-creation/
- 使用教程：[USER_GUIDE.md](USER_GUIDE.md) ｜ [User Guide (EN)](USER_GUIDE_EN.md)
- 文档总览与阅读顺序：[docs/README.md](docs/README.md)（design / features / guides）
- 变更历史：[CHANGELOG.md](CHANGELOG.md)
- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md) ｜ 行为准则：[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## 许可证

- 社区版：[AGPL-3.0-only](LICENSE)，含网络 / SaaS 使用。
- 商业闭源集成另获专有授权，协议模板见 [docs/COMMERCIAL-LICENSE.md](docs/COMMERCIAL-LICENSE.md)；所有贡献者需签署 [docs/CLA.md](docs/CLA.md)。
- 完整说明见 [docs/guides/licensing.md](docs/guides/licensing.md)。
