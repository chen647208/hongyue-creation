# 02 目标架构：进程模型、分层与目录树

> 依据：10 篇架构总纲 + 01 起点基线。原则：在既有基建（repository 抽象、CI、i18n）上演进，不推倒重来。

## 1. 进程模型（目标态）

```
┌─ Electron 主进程 ────────────────────────────────────────────┐
│ AppServiceContainer（Provider 容器，boot/shutdown 生命周期）    │
│  LogProvider · ConfigProvider · DbProvider(better-sqlite3-multiple-ciphers)    │
│  FsProvider · DialogProvider · BackupProvider · VectorProvider │
│  StoreProvider（实体读写唯一入口，封装 repository v2）           │
│  IndexProvider（引用索引器宿主）                                │
│  AiGatewayProvider（模型适配器宿主，从渲染层迁入）               │
│  PluginHostProvider（P3 才启用：发现/隔离加载/生命周期）         │
│ IPC：每 Provider 一通道 + IPCAPI<T> 类型化命令联合（02 篇 Zettlr）│
└──────────────────────────────────────────────────────────────┘
         ▲ 薄壳：Electron IPC / HTTP(未来) / MCP(出口)
┌─ src/core（平台无关领域核心，纯 TS，无 Electron/React 依赖）────┐
│ entities/（六实体+类型注册表）· index/（扫描器）· dsl/（文本格式）│
│ build/（Build Profile）· ai/（ToolSpec/技能/审批协议）          │
│ plugin/（manifest 类型+贡献点契约，运行时在宿主侧）              │
└──────────────────────────────────────────────────────────────┘
         ▲ 消费
┌─ 渲染进程（React 应用）──────────────────────────────────────┐
│ app-shell（槽位系统/书架/工作区）· features/*（= 内置插件）      │
│ editor/（TipTap 正文 + CM6 DSL）· store/（单一应用状态）        │
└──────────────────────────────────────────────────────────────┘
```

要点：
- **core 是皇冠**：不依赖 Electron、不依赖 React、不依赖 DOM——这是未来 VS Code 形态、Web 形态、MCP server 共用的同一颗心（06 篇 Fountain/betterfountain 启示）。
- **AI 调用从渲染层迁到主进程**（AiGatewayProvider）：密钥不进渲染进程、流式回调走事件、第三方宿主复用同一网关。现有 5 个适配器代码平移即可。
- **repository 抽象保留并升格**：`StorageRepository` 演进为 `StoreProvider` 的实现细节，三后端选择逻辑不变（桌面/浏览器/兜底）。

## 2. 分层与导入边界（ESLint 强制）

```
features/* ──┐
editor/*  ───┼──→ core/* ──→ shared/*        （只准向下）
app-shell/* ─┘         ✗ Electron/React/DOM  （core 的禁区）
任何层 ──✗──> fs/网络/SQL 直连（必须经 StoreProvider / AiGateway / IndexProvider）
```

边界由三组 ESLint 规则强制：
1. `src/core/**` 禁止 import `electron`、`react`、`@renderer/*`。（已落地为 error）
2. `src/renderer/features/**` 禁止 import `repository` 内部实现，只准 import `@core/*` 与注入的 API 对象。（已落地为 error；存量 5 文件冻结在 `eslint.config.js` 的 ignores，清一件删一件）
3. 跨 feature 引用只准走 `core` 契约或事件总线，禁止 import 对方实现。规则 `local/no-cross-feature`（`eslint-rules/no-cross-feature.js`）把相对路径与 `@/features` 别名都解析为绝对路径后判断，已落地为 error；存量边按「源->目标」冻结在 `eslint.config.js` 的 `CROSS_FEATURE_DEBT`（19 条），只拦新增边，清一条删一条。无依赖的共享模块已迁 `src/renderer/shared`（`aiService`、`mcpClient`、`displayLabels`、`characterKinds`）。

## 3. 目标目录树

```
src/
├── core/                        # ★ 平台无关领域核心
│   ├── entities/                #   六实体类型 + 校验（03 篇）
│   ├── types-registry/          #   类型模板注册表 + 内置模板定义（03 篇）
│   ├── dsl/                     #   开放文本格式：解析/序列化/frontmatter（03 篇）
│   ├── index/                   #   扫描器、引用图、增量 reindex（03 篇）
│   ├── changes/                 #   entity_changes、instanceId/agentId（03 篇）
│   ├── build/                   #   Build Profile：选择/变换/渲染契约（07 篇）
│   ├── ai/                      #   ToolSpec、技能加载、审批协议、事件流（05 篇）
│   ├── plugin/                  #   manifest schema、贡献点类型、错误契约（04 篇）
│   └── events/                  #   三层事件域定义（04 篇）
├── main/                        # Electron 主进程
│   ├── app/                     #   AppServiceContainer + lifecycle + boot 守卫
│   ├── providers/               #   log/config/db/fs/dialog/backup/vector/store/index/ai-gateway
│   ├── plugin-host/             #   P3：发现/隔离加载/状态面板数据
│   └── ipc.ts                   #   每 Provider 一通道注册
├── preload/                     # 语义化桥（现有 preload.ts 拆出）
└── renderer/
    ├── app/                     # 壳：App.tsx 瘦身为路由+装配
    ├── app-shell/               # 槽位系统、书架、工作区导航
    ├── store/                   # ★ 单一应用状态（替代 683 行 useState 根）
    ├── editor/                  # ★ TipTap 节点/扩展 + CM6 language
    ├── features/                # 15 个现有 feature → 逐步"内置插件化"（08 篇 M3）
    ├── i18n/                    # 保留（已达标）
    └── shared/                  # UI 工具、hooks、ai 适配器（迁走后仅留 UI 侧客户端）
```

## 4. 状态管理决策

现状 App.tsx 683 行 useState 根组件不可持续（新架构下状态源变成 core 索引 + 异步存储）。选型 **Zustand**（不引 Redux/TanStack Query 全家桶）：

- `useBookStore`：当前书的工作副本（从 StoreProvider 水合，写操作走 command 管线）。
- `useAppStore`：全局 UI 态（活动书、面板、主题、语言——后两者迁移期继续用 AppState 字段，M1 收编）。
- **写路径唯一**：UI 动作 → command（04 篇命令注册表）→ core 变更 → entity_changes + transaction 事件 → store 更新 → UI。禁止 feature 直接 setState 跨域数据。

## 5. 与现状的衔接（不推倒清单）

| 现有资产 | 处置 |
|---|---|
| StorageRepository + SqlDriver + MIGRATIONS | 保留，schema v1→v2 扩展（03 篇） |
| FTS5 trigram 中文检索 | 保留，并入索引器输出 |
| 5 个 AI 适配器 + sse/retry/json | 代码平移进 AiGatewayProvider |
| i18next / themeService / DialogHost / ToastHost | 原样保留 |
| CI（lint/typecheck/test/build）+ verify + 许可证头 | 原样保留，叠加 core 边界 lint 规则 |
| vectra + 7 个向量服务 | 合并为 EmbeddingProvider + VectorIndex（M0 减脂） |
| shared/types.ts 双轨 | M0 完成拆分收编（types/ 目录转正，types.ts 退役） |
| chapterSnapshotService | 升级为 Revision 实体的前端（03 篇） |
| virtualChapters 字段 | 被 Edge 多父模型取代（03 篇），迁移期做映射 |

## 6. 验收标准（本设计的完成定义）

1. `npm run verify` 全绿（lint 含新边界规则）。
2. `src/core` 可独立打包为 npm 包（`npm pack` 冒烟：无 electron/react 依赖解析）。
3. 主进程 Provider 容器 boot/shutdown 有单测；IPC 通道数从 12 裸字符串收敛为每 Provider 一通道 + 类型化载荷。
4. App.tsx < 150 行（只剩装配与路由）。
