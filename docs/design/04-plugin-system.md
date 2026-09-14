# 04 插件系统设计：manifest v0、贡献点与运行时

> 依据：编辑器内核与插件规范调研（合成方案）+ codex manifest 实测 + Twine 版本区间/函数契约 + deepseek-harness 社区设计债 → day-1 清单（调研归档于 git 历史）。
> 定位声明：插件规范是**产品地基**不是扩展选项——功能广度靠生态供给（05 篇 bibisco 教训），核心只做数据模型 + 扩展机制。

## 1. manifest v0（`plugin.json`，schema 在 `src/core/plugin/manifest.ts` 定义）

```jsonc
{
  "$schema": "https://hongyue.dev/schema/plugin-v0.json",
  "id": "com.example.golden-three-chapters",   // 反向域名，全局唯一，命名空间根
  "name": "golden-three-chapters",
  "version": "1.0.0",
  "description": "网文黄金三章开篇法",
  "keywords": ["写法", "开篇", "网文"],
  "host": "^2.0.0",                             // ★ Twine 模式：宿主版本区间
  "license": "MIT",
  "engine": "ts2024",                           // 逻辑型插件的运行时要求

  "contributes": {
    "types":        ["./types/"],               // 类型模板（03 篇）——资源型，零编译
    "skills":       ["./skills/"],              // SKILL.md 写法技能（05 篇）——资源型
    "buildProfiles":["./builds/"],              // Build Profile（07 篇）——资源型
    "commands":     ["./commands.json"],        // 命令声明（含 UI 菜单位置）
    "ui":           ["./ui.json"],              // 槽位贡献（§4）
    "mcpServers":   { "inline": { "graph-query": { "command": "..." } } },
    "hooks":        "./hooks.yml",              // 能力接缝装饰（§5）
    "editor":       ["./editor/"],              // 逻辑型：编辑器扩展目录（含 index.html，iframe 内）
    "renderers":    ["./renderers.json"]        // 导出渲染器（07 篇）
  },

  "permissions": {
    "read":  ["manuscript", "cards", "index"],   // 数据域枚举白名单
    "write": ["cards"],
    "network": false,
    "ai":    { "quotaPerHour": 20 }
  },
  "activation": "onDemand",                      // VS Code 模式：懒激活
  "interface": {                                 // codex 市场元数据（分发用）
    "displayName": "黄金三章", "category": "writing-method",
    "capabilities": ["read:manuscript", "write:cards"],
    "defaultPrompt": ["用黄金三章法重写第一章"],
    "logo": "./icon.svg", "screenshots": []
  }
}
```

**规则**（写进 schema 校验器，加载即验证）：
1. `contributes` 的每个键是**声明**，宿主负责装配；插件代码不得 monkey-patch 宿主对象（CM6 extension-as-value 原则，09 篇）。
2. 函数契约显式化（Twine 模式，04 篇）：所有被宿主回调的函数必须**同步、无副作用、幂等（会被反复调用）**；异步逻辑只能经 `ctx.events` 与 `ctx.tasks`。违反者由沙箱运行时强制（worker 内冻结 window/globalThis 非必要面）。
3. 版本区间不得重叠；无匹配区间 = 该贡献整体失效并上报（不静默半生效）。
4. 资源型贡献（types/skills/buildProfiles）零代码、可热重载；逻辑型（editor/hooks/mcpServers）走沙箱。

## 2. 生命周期与故障隔离（harness 血泪 → day-1 硬约束）

```
discover → validate(manifest+版本区间) → load(逐插件 try-catch)
        → activate(懒：首次触达贡献点才激活)
        → deactivate → unwind(逆序回滚全部注册)   ← 可逆注册不变量
```

```ts
type PluginState = 'loaded'|'active'|'failed'|'disabled'|'uninstalled';
interface PluginStatus { id: string; state: PluginState; error?: PluginError; activatedAt?: number; }
```

- **逐插件 try-catch**：任何一插件在任一阶段抛错只标记自身 `failed`，其余照常（harness 2026-08-25 事故的直接教训）。
- **状态面板**（内置 UI）：loaded/failed/skipped 汇总 + 每插件错误详情 + **一键禁用**（配置级 `disabled: string[]`，不碰文件）。
- **错误契约**：`PluginError { pluginId, phase, message, cause: unknown[] }`——cause 链完整保留（harness"吞 cause"帖教训），终端/日志/状态面板三处可见同一 cause。
- **unwind 不变量**：注册返回 `Disposable`，插件卸载/禁用时逆序释放（harness Cordis 唯一值得全盘照抄的机制）。core 的注册表 API 一律返回 Disposable。

## 3. 命名空间（防冲突，harness `/plugin:command` 提案落地）

| 资源 | 规则 | 示例 |
|---|---|---|
| 命令 | `/<plugin-short-id>:<cmd>` | `/golden3:rewrite-opening` |
| 类型模板 | `<plugin-short-id>.<type>` | `drama.script-scene` |
| 事件域 | `plugin.<id>.<event>` | `plugin.golden3.chapter-scored` |
| 设置键 | `plugin.<id>.*` | 存 settings 表 |
| 存储命名空间 | 插件私有数据进 `plugin-data/<id>/` | — |

内置功能同样吃规则（`core.character`、`/core:export`）——dogfooding 保证命名空间不是摆设。

### 3.1 插件间交互协议（day-1 硬约束，DSH 乱象对策）

插件间**只允许**通过以下四条通道交互，其余一律视为违规：

| 通道 | 形态 | 约束 |
|---|---|---|
| 事件 | EventBus `plugin.<shortId>.<event>` | 只能发布本域事件，越域抛错（PluginContext 强制） |
| 贡献点 | tools/sections/skills/types 注册表 | 经宿主注册返回 Disposable，禁止直接改宿主对象 |
| 依赖 | manifest `dependencies: { id: 版本区间 }` | 激活按拓扑序；缺失/不满足/循环 = failed 且 cause 完整 |
| 数据 | PluginContext.store（权限代理） | deny-by-default，未声明域直接拒绝 |

**禁止**：直接 import 其他插件的内部模块；monkey-patch 宿主对象；绕过
权限代理触达数据。运行时由 PluginContext（core/plugin/context.ts）强制
1/3/4，贡献点由注册表结构上保证 2。内置三 bundle（core/world/ai）以
同一 manifest 形态声明依赖（ai → world → core），作为交互规范的
dogfooding 样例。

## 4. 贡献点详表（9 类，v0 先开 3 类）

| # | 贡献点 | 形态 | 开放期 |
|---|---|---|---|
| 1 | **类型模板** | 资源（JSON/TS 声明） | **v0** |
| 2 | **技能 SKILL.md** | 资源（Markdown） | **v0** |
| 3 | **Build 渲染器/变换器** | 资源+逻辑 | **v0** |
| 4 | 命令 + 菜单位置 | 声明 + 回调 | v1 |
| 5 | UI 槽位（见下） | 声明 + 沙箱组件 | v1 |
| 6 | 编辑器扩展（TipTap/CM6） | 逻辑（worker） | v1 |
| 7 | MCP server | 外部进程 | v1（内置先吃） |
| 8 | hooks（能力接缝） | 声明式策略 | v2 |
| 9 | 主题/字体/图标 | 资源 | v2 |

**UI 槽位系统**（Trilium Launcher 模式扩展）：固定槽位枚举 `bookshelf-item | workspace-nav | sidebar-panel | editor-toolbar | editor-context | command-palette | status-bar | aux-window`。插件声明 `{slot, component, when?}`，宿主渲染；用户可在设置里对"可见/可用"两态增删（launcher 的可见性模型）。

## 5. 能力接缝（hooks，harness capability-seams 概念）

三条官方接缝，插件挂策略不侵入实现：
- `fs/*`：读写拦截（如"禁止插件写 novel/ 目录"）
- `ai/*`：请求/响应拦截（如"注入风格约束"、"敏感词过滤"）
- `index/*`：索引事件订阅（如"人物卡变更 → 自动重跑图谱"）

hooks.yml 声明式：`{ on: 'ai.request', do: 'inject', where: 'system', text: '...' }`——简单装饰零代码，复杂逻辑才上 mcpServers。

## 6. 沙箱与权限执行

- **资源型**：无代码，schema 校验即安全。
- **逻辑型（editor/ui）**：渲染层 Web Worker（无 DOM）+ 桥接 API；UI 组件走 iframe（Figma 双线程模式，09 篇）。宿主按 `permissions` 枚举代理一切数据访问——worker 拿到的 `ctx` 是权限裁剪后的代理对象。
- **外部进程型（mcpServers）**：进程隔离 + 工作目录白名单；密钥经主进程注入不进插件环境。
- 权限声明缺失 = 默认拒绝（deny-by-default）；`permissions.write` 未声明的写请求在 StoreProvider 层直接抛 `PermissionDenied`。

## 7. 组合发行：bundle / profile / patch（harness 模式）

```
profiles/
├── minimal.yml        # 核心 + 纯写作（禁全部 AI 的发行档，公理 4 的实体化）
├── webnovel.yml       # + 黄金三章/断章钩子/追读分析/番茄导出
└── literary.yml       # + 雪片法/人物弧线/EPUB 精装导出
bundles/               # 功能包：一组贡献 + 依赖声明
patches/               # 用户级 cordis.patch 式覆盖：按 id 替换/禁用任意装配行
```

- 内置 15 个 feature 在 M3 逐个改造为 bundle（08 篇）——**官方插件与社区插件同一加载路径**（dogfooding）。
- `装配树查看器`（内置 UI）：打印当前 profile 的完整装配（每行来源 bundle/patch），任何一行可右键"生成 patch 覆盖"——harness `--dump-config` 的 GUI 版。

## 8. 事件总线（三层事件域，harness 架构实测）

```ts
interface Event Bus {
  // 1. 持久事实：进 entity_changes/session log，reload 后仍在
  fact(type: 'node.changed'|'ai.approved'|'build.completed', payload)
  // 2. 活体拦截：agent/*、editor/*，可 observe 可 veto（审批类）
  intercept(type: 'ai.request'|'editor.transaction', handler): Disposable
  // 3. 能力接缝装饰：fs/*、ai/*、index/*（§5）
  decorate(seam: 'fs'|'ai'|'index', policy): Disposable
}
```

事件清单文档化（producer/consumer 表，harness event-map 模式），CI 校验事件名注册。

## 9. 许可证与生态边界

- 宿主 AGPL-3.0 不变。**插件 SDK（`@hongyue/plugin-sdk`，类型+运行时垫片）单独 MIT 发布**——避免许可证传染吓退生态，同时 AGPL 对"改宿主"仍然有效。
- 插件是独立作品：经公开 API/协议交互，不链接宿主内部——这条写进插件规范 FAQ。

## 10. 验收标准

1. manifest schema 校验器 + 错误信息定位到 JSON 路径。
2. 故障隔离测试：注入一个 load 期抛错的插件 → 其余插件全部可用、状态面板正确、一键禁用生效。
3. unwind 测试：禁用插件后其注册的命令/类型/事件全部消失，重新启用恢复。
4. 命名空间冲突测试：两个插件注册同名类型 → 各自前缀化，互不覆盖。
5. 权限测试：未声明 write 的插件写数据 → PermissionDenied 且 cause 链完整。
6. 资源配额测试：装载超限插件 → 仅该插件 failed，错误含贡献键与实测值，其余照常。
7. 路径门测试：符号链接越界、`../` 越界、deny-list 命中各返回 PermissionDenied 且 cause 完整。

## 11. PI-Desktop 对标落地方案

来源：https://github.com/vastsa/PI-Desktop（LGPL-3.0，只借设计不抄代码）；对位见 `20-external-benchmark.md` §2.1。
本节给出插件系统对齐该蓝本的落地规范，是 §2/§6/§10 的细化。

### 11.1 现状对位

| 机制 | PI-Desktop | 本项目现状 | 落地动作 |
|---|---|---|---|
| 生命周期状态机 | discover→validate→load→activate→deactivate→unwind，装配失败回滚 | `PluginHost` 同序；activate 失败先 unwind 再置 failed（`runtime.ts`） | 对齐，补失败注入用例（§11.6.8） |
| 可逆注册 | Disposable 逆序释放 | `Disposable` + `unwind` 已具备 | 对齐 |
| 权限默认拒绝 | 声明 ∩ 授权，deny-by-default | `assertPermission`/`assertCan` 域级 deny-by-default | 对齐，补 write 边界用例 |
| 路径四道门 | 声明∩授权 → realpath 包含 → deny-list → scope | 词法两道门（相对/越界/拒绝清单）已落地（`pathGate.ts`），装配中途失败可回滚（`ContributionSink`） | realpath 由主进程 fs 代理承担（与逻辑型插件同批） |
| 资源配额 | 每插件 ≤32 skill、单文件 ≤128KiB | `checkContributionLimits` 装载期校验（§11.3） | 已落地 |
| 长会话检查点 | JSONL 真相 + SQLite 索引 + `.inflight.json` 原子替换 | 会话存储归 05/11 | 不在此，转 05/11 |
| 进程隔离 | Rust host core + sidecar stdio JSON-RPC | 全 Node、无 Rust 人力 | 不迁移 |

### 11.2 文件访问四道门

插件的任何文件系统访问，依次过四道门，任一道不过即拒绝，且 `cause` 链完整：

1. **声明 ∩ 授权**：manifest `permissions.fs.read`/`permissions.fs.write` 声明的**路径模式**，且用户在安装/设置中授予；默认拒绝。
2. **realpath 包含**：目标路径经 `fs.realpath`（解析符号链接后）必须落在授权根内；跨根即拒绝。
3. **deny-list**：无论是否声明，`.git`、应用数据根、密钥目录、`node_modules` 永久拒绝。
4. **scope**：插件可写面限于 `plugin-data/<pluginId>/`，可读面限于自身贡献目录；项目正文/设定的写必须显式 `write:<domain>`。

词法两道门（拒绝清单 + 作用域）已落地在 `core/plugin/pathGate.ts`：`checkPluginRelPath`/`checkPluginFileName`
拒绝绝对路径、`..` 越界与拒绝清单命中，装配器对 `contributes` 声明的每个目录与目录项先过门再读取。
realpath 包含需要宿主文件系统，归主进程 fs 代理（`PluginPermissions` 扩 `fs` 字段），与逻辑型插件同批交付。
逻辑型插件上线前，§5 的 `fs` 接缝只接受声明式策略。

### 11.3 资源配额与校验（已落地）

装载期对 `DiscoveredPlugin.files` 施加，违规使该插件 `failed`（phase=`load`），错误给出贡献键与实测值：

| 约束 | 上限 |
|---|---|
| 单文件字节 | 128 KiB |
| 单贡献键文件数 | 32 |
| 插件文件总数 | 96 |
| 插件总字节 | 2 MiB |
| 路径 | 必须相对且不含 `..` 段（拒绝越界） |

落点：`runtime.ts` 的 `checkContributionLimits(plugin)`，`loadAll` 装载前调用；上限常量为具名导出。

### 11.4 安全边界（现在时）

- 插件无 OS 级沙箱；`fs` 权限只挡宿主 API，不挡插件进程内建调用——逻辑型插件维持不执行（第一条总根：v0 仅资源型可用）。
- 插件包仅 sha256 校验、无签名；安装来源需用户显式确认。

### 11.5 不迁移项

Rust host core、stdio JSON-RPC sidecar、面向编码的文件/diff/Bash 工具、LGPL 代码。

### 11.6 验收标准（补 §10）

8. 装配回滚：注入第 2/3 个注册项抛错的插件 → 逆序释放已注册项，状态 `failed`，宿主无残留。
9. 配额：见 §10.6；路径门：见 §10.7。
10. `fs` 门（逻辑型插件同批）：符号链接指向授权根外 → 拒绝；`../` 越界 → 拒绝；写入非 `plugin-data/<id>/` → 拒绝。

## 12. Sonarr 对标落地方案（扩展点 / 调度 / 健康）

来源：https://github.com/Sonarr/Sonarr（GPL-3.0，只借设计）；对位见 `20-external-benchmark.md` §2.2。

### 12.1 现状对位

| 机制 | Sonarr | 本项目现状 | 动作 |
|---|---|---|---|
| 统一扩展点 | `ThingiProvider`：接口 + 设置 UI + 生命周期 | 多条注册表各自为政（`SkillCatalog`、类型注册表、`BuildProfileRegistry`、`uiSlots`、`commandRegistry`、`settingsTabRegistry`） | 目标：贡献点经 `contributionRegistry` 统一挂载，每 provider 声明 `{ id, kind, install, settings }`（v1 随命令/UI 槽位） |
| 后台任务调度器 | 集中调度 + Housekeeping | `TaskScheduler` 已落地：`AutoBackupService` 的兜底备份经 60s 周期任务驱动，落盘触发路径共用同一入口 | 已落地 |
| 状态退避 | `ProviderStatusServiceBase`：失败升档 → `DisabledTill` | `ProviderStatusService` 已落地；`PluginHost` 在退避窗内跳过激活 | 已落地 |
| 健康检查 | 内置子系统 | `collectHealth` 已落地（数据目录可写/存储配置可解析/日志目录），随诊断包导出为 `health.json` | 已落地 |
| 备份 | 内置 | `AutoBackupService` 已具备 | 对齐 |
| 认证 | 内置 | 单机本地应用 | 不迁移 |
| 双库迁移 | FluentMigrator | SQLite schema 迁移（v3） | 仅作迁移自检参考 |

### 12.2 落地状态

1. `TaskScheduler`（已落地）：`renderer/shared/services/taskScheduler.ts`；自动备份兜底（60s）经它驱动，任务抛错隔离、错峰不叠峰。
2. `healthCheck`（已落地）：`main/app/diagnosticsCore.ts` 的 `collectHealth`，随诊断包导出为 `health.json`。
3. `contributionRegistry`（已落地引擎 + 收编两个注册表）：统一贡献注册表引擎 `renderer/shared/services/contributionRegistry.ts`（注册返回 Disposable、order 排序、引用稳定快照）；`commandRegistry` 与 `settingsTabRegistry` 已继承它。schema 驱动设置表单待后续。

### 12.3 不迁移

GPL-3.0 代码、.NET/AspNetCore/SignalR 栈、PVR 领域模型、Web 服务 + 浏览器 UI 部署模型。

### 12.4 验收标准

- 调度器：单任务抛错不影响其余；周期任务错峰不叠峰；`stop()` 后计时器全部清除。
- 健康检查：数据目录可写、存储配置可解析、日志目录存在三项随诊断包导出，失败项带可执行说明。

## 13. Sonarr Provider 抽象落地设计（contributionRegistry）

来源：https://github.com/Sonarr/Sonarr（GPL-3.0，只借设计）；见 `20-external-benchmark.md` §2.2。

### 13.1 Sonarr 的做法

- **定义行 `ProviderDefinition`**（存 DB）：`Id / Name / Implementation / ConfigContract / Settings(JSON) / Enable / Priority / Tags`。
- **能力接口**：`IProvider` 基类 + 领域接口（`IIndexer`/`IDownloadClient`…）；实现暴露 `ConfigContract => typeof(TSettings)` 与 `IProviderConfig.Validate()`。
- **工厂 `ProviderFactory<TProvider, TProviderDefinition>`**：`All()`/`Active()`（按 Enable+Priority 过滤）/`GetAvailableProviders()`/`GetDefaultDefinitions()`/`SetProviderCharacteristics()`；所有实现经依赖注入集合 `IEnumerable<IProvider>` 汇入，工厂不 new 具体类型。
- **设置多态**：配置以 JSON 存一行，按 `ConfigContract` 类型名反序列化为对应 settings 类型；`NullConfig` 兜底。
- **设置 UI 生成**：服务端下发 `fields[]`（`name/type/label/order/helpText/advanced/unit`），前端按 schema 渲染表单，无每种 provider 的手写表单。
- **状态与退避**：`ProviderStatusServiceBase` 失败升 `EscalationLevel` 并设 `DisabledTill`，成功后逐级回退。

### 13.2 对位到本项目

| Sonarr | 本项目落点 |
|---|---|
| `IProvider` + `ConfigContract` | `ContributionProvider`：`{ kind, id, install(sink), settingsSchema, defaultSettings?, status? }` |
| `ProviderDefinition`（DB 行） | 每插件的贡献配置行（`plugin.<id>.<kind>`，存设置域，已有命名空间规则 §3） |
| `ProviderFactory.All()/Active()` | `contributionRegistry`：按 `kind` 索引，统一 install/uninstall + 排序 + 启用过滤 |
| 设置 JSON 多态 | 设置以 `settingsSchema`（JSON Schema，复用工具参数体系）持久化，键即声明 |
| `fields[]` 驱动 UI | 设置表单由 JSON Schema 生成，替代每种贡献的手写面板 |
| `ProviderStatusServiceBase` | 接入 `PluginHost` 状态 + 退避（`EscalationLevel`→禁用至时间戳） |

原则：**一个贡献 = 一份声明（schema）+ 一个装配函数（install）+ 一条状态**；宿主按 kind 统一渲染设置与调度，加贡献不改应用壳。现有散落注册表（`uiSlots`/`commandRegistry`/`settingsTabRegistry`/`SkillCatalog`/`BuildProfileRegistry`）逐步收敛到 `contributionRegistry` 的对应 kind，收敛一个删一个。

### 13.3 落地状态与验收

1. `renderer/shared/services/contributionRegistry.ts`：`ContributionRegistry<T>`（注册返回 Disposable、按 order 排序、引用稳定快照、订阅）已落地，配单测。
2. `commandRegistry` 与 `settingsTabRegistry` 已收编为它的子类，公开 API 不变。
3. 设置表单由 schema 渲染（已落地引擎）：`shared/ui/SchemaForm.tsx` 按 JSON Schema 渲染 string/number/boolean；插件状态面板对声明 `settingsSchema` 的插件渲染设置并持久化在 `plugin.<id>.settings`。enum/嵌套对象待后续。

验收：加一个贡献只写声明 + register，不改应用壳；禁用后贡献与设置项一并消失；状态退避可见（第 3 项待）。
