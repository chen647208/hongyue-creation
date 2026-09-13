# 设置功能说明

## 适用范围

本文件覆盖模型设置、Embedding 设置、提示词设置、存储设置与系统说明。
对应代码位于 `src/renderer/features/settings`。

## 核心文件

- `SettingsModal.tsx`：设置弹窗主编排器
- `components/SettingsTabNav.tsx` + `SettingsTabContent.tsx`：标签导航与内容分发
- `components/SettingsModalHeader.tsx` + `SettingsModalFooter.tsx`：头尾（含暂存保存按钮）
- `components/GeneralSettingsPanel.tsx`：语言/主题/字体/快捷键/系统/代理（直写 store 即时生效）
- `components/SystemPanel.tsx`：最小化到托盘 + 开机自启（经 `shellSync.ts` 下发主进程）
- `components/ProxyPanel.tsx`：代理地址 + 连通测试（经 `shellSync.ts` 下发，网关与 Chromium 双覆盖）
- `components/ModelSettingsPanel.tsx`：模型配置面板（`ModelSettings.tsx` 为入口组件）
- `components/ProviderSidebar.tsx` + `ProviderEditor.tsx`：渠道侧栏与参数编辑
- `components/EmbeddingSettingsPanel.tsx` + `EmbeddingSidebar.tsx` + `EmbeddingEditor.tsx`：Embedding 配置
- `components/PromptTemplatesPanel.tsx`：提示词模板管理
- `components/CardPromptSettingsPanel.tsx`：卡牌命令模板管理
- `components/ConsistencyPromptSettingsPanel.tsx`：一致性检查模板管理
- `components/PluginSettingsPanel.tsx`：插件状态面板（发行档/装配树入口）
- `components/UserSkillsCard.tsx`：写法技能（内置只读 + 用户 SKILL.md 导入/删除，嵌在插件面板）
- `components/StorageSettingsPanel.tsx`：存储设置面板
- `components/SystemGuidePanel.tsx`：系统说明和使用引导
- `components/ShortcutRecorder.tsx` + `services/keybindings.ts`：快捷键录制/冲突检测/默认回退（`App.tsx` 开关与分区跳转、`WritingEditor.tsx` 查找条只读合并态）
- `services/modelListService.ts`：模型列表拉取服务
- `services/embeddingModelService.ts`：Embedding 模型配置服务
- `factories.ts`：设置项构造与默认值生成
- `constants.ts`、`types.ts`：设置域常量与类型

## 主要职责

- `SettingsModal.tsx` 负责标签页切换、设置项收集和整体保存流程
- 各 `Panel` 组件分别管理单一设置主题，降低设置弹窗复杂度
- 服务层负责模型列表拉取、Embedding 配置读写和相关辅助逻辑

## 关联模块

- 写作、助手、知识库和一致性检查都会依赖设置中的模型或模板配置
- 设置持久化走 `app/stores/settingsStore.ts` + `persistenceBridge.ts` 差分落盘
- 主进程侧：`main/app/tray.ts`（托盘/自启/关闭拦截）+ `main/net/proxy.ts`（地址校验/豁免/dispatcher）+ `proxyIpc.ts`
- 诊断：`main/app/diagnosticsCore.ts`（收集日志/窗口几何/存储配置/环境信息 + `health.json` 健康检查）+ `diagnostics.ts`（IPC + zip 另存）；存储面板「导出诊断包」；主进程 `crashReporter` 本地留存转储
- 存储安全：启动执行快速 `quick_check`；存储面板完整性检查执行深度 `integrity_check`；自动备份在 JSON 快照之外生成数据库热备份（`VACUUM INTO`，滚动保留），且库级加密开启时 JSON 快照落密文；库级 AES-256 加密默认关闭，可在存储面板启停并导出/应用恢复码（密钥走系统钥匙串），细节见 `docs/design/25-data-safety.md`
- 保存语义：语言/主题/字体直写即时生效；模型与密钥类暂存按保存落盘（防半配置生效），关闭直接丢弃

## 界面功能开关

- 位置：设置 → 通用 → 界面功能开关，组件为 `src/renderer/features/settings/components/FeatureTogglesPanel.tsx`。
- 开关项：助手面板、全库检索、世界关系图、一致性检查、智能推荐、增强时间线、数据视图、双轴时间线、剧本。
- 语义：默认开启，关闭即从界面移除入口，数据不受影响；状态存 `localStore` 的 `features.disabled`。

## 实体类型与字段

- 位置：设置 → 通用 → 实体类型与字段，组件为 `src/renderer/features/settings/components/EntityTypesPanel.tsx`。
- 内置类型只读；当前作品可自定义类型与字段（9 种字段类型），经 `genericModelStore` 写入 `item_types` 与 `fields`。

## 操作日志

- 位置：设置 → 存储 → 操作日志，组件为 `src/renderer/features/settings/components/OperationLogPanel.tsx`。
- 内容：当前作品按时间倒序的正文修订，展示时间、作者（`user` 或 `ai:<工具>`）、触发原因与正文预览；数据来自 `revisions` 表，经 `loadOperationLog` 读取（JSON 后端返回空）。

## 外部文件夹镜像

- 位置：设置 → 存储 → 外部文件夹镜像，组件为 `src/renderer/features/settings/components/MirrorPanel.tsx`，逻辑在 `src/renderer/shared/services/mirrorService.ts`。
- 导出：把作品写成 `project.json`、`meta.json` 与 `chapters/<序号>-<标题>.md` 到所选文件夹，供云盘同步。
- 导入：读取所选文件夹的 `project.json` 并以新 ID 加入书库。
- 边界：镜像为非活动副本；活动数据库不同步到外部文件夹。

## 实时协作

- 位置：设置 → 通用 → 实时协作，组件为 `src/renderer/features/settings/components/CollaborationPanel.tsx`；会话逻辑在 `src/renderer/app/collaboration/collaborationService.ts`。
- 依赖：仅 `yjs`（MIT）。不用 `y-indexeddb`（避免与 sqlite 形成第二份真源），不用 `y-websocket`/`y-webrtc`（避免绕过主进程网络门）。
- 传输：同机多窗口经原生 `BroadcastChannel` 交换 Yjs 增量与在线状态（`features/collaboration/broadcastTransport.ts`）；填了中转地址则经主进程 WebSocket 跨设备同步（`features/collaboration/ipcTransport.ts` + `main/app/collab.ts`）。
- 网络面：渲染层不直接建连，WebSocket 由主进程持有并经 IPC 收发，仅接受 `ws://` 与 `wss://`；中转服务见 `scripts/collab-server.mjs`（按房间广播，不持久化）。
- 播种握手：加入者先请求对端状态，收到远端状态即采用；等待窗口内无对端才用本地作品播种，避免两端各自播种产生重复章节。
- 在线状态：对端心跳每 4 秒一次，超过 12 秒未心跳即剔除；面板显示在线成员。
- 模型：章节列表为 `Y.Array<Y.Map>`，正文为 `Y.XmlFragment`；编辑器经 `@tiptap/extension-collaboration`（底层 `@tiptap/y-tiptap`）绑定该片段，DSL 与片段互转在 `features/collaboration/editorBinding.ts`。远端改动实时合并，撤销由协作扩展的 `yUndoPlugin` 接管；远端光标经 `@tiptap/extension-collaboration-caret` 与 `y-protocols/awareness` 渲染，awareness 增量随同一传输通道同步。
- 持久化：协作副本不单独落盘；编辑器变更经 `pmDocToDsl` 序列化回 `projectStore`，仍走既有差分落盘。
- 边界：跨设备协作需主进程通道（后续接入）；同一段落的并发编辑按 CRDT 规则收敛，不做字符级同文档绑定（`y-prosemirror` 属后续）。

## 维护建议

- 新增设置项优先落到对应 `Panel` 组件，不要直接堆到 `SettingsModal.tsx`
- 模型、Embedding、模板相关逻辑优先放到 `services`、`factories.ts` 或 `constants.ts`
- 保持设置面板按主题拆分，便于后续继续扩展
