# 49 可执行插件描述符协议

## 背景与问题

48 篇把两类能力挂在「待可执行沙箱描述符协议」上：

- `contributes.renderers` 的导出渲染器接线。渲染器契约 `core/build/pipeline.ts` 的 `Renderer.render()` 是同步纯函数，而插件可执行逻辑经 `main/app/pluginSandbox` 异步沙箱运行；同步调用方与异步执行通道之间缺一份声明形态。
- 脚本层的命令管道、循环、子程序与事件触发。公式层（`shared/formulaScript.ts`）只读行字段，表达不了命令编排。

插件 manifest 把 `renderers` 当路径字符串数组，缺「入口文件 + 导出名 + 能力 + schema」的描述符，宿主在装载期无法拒绝越权或非法的可执行贡献。缺协议导致导出渲染器与脚本层无法接入既有沙箱。

## 目标

- 定义 `contributes.renderers` 与 `contributes.scripts` 的描述符形态与校验规则，装载期拒绝非法贡献（deny-by-default）。
- 描述符只引用函数（入口文件 + 导出名），不携带代码；执行一律经既有沙箱与权限门。
- 明确渲染器同步契约的落地方式与取舍。
- 明确能力模型：能力只指向宿主契约，插件拿不到裸网络、文件与 `eval`。

## 非目标

- 本轮不执行 JS/WASM；沙箱执行与宿主接线属后续阶段。
- 不改渲染器同步签名（`Renderer.render()` 保持同步）。
- 不改既有 `contributes` 字段行为；缺省不启用 `renderers`/`scripts` 的可执行路径。
- 不做脚本语言的语法与语义设计（命令、管道、循环、子程序的语义归 47 篇）。

## 设计

### 1. 描述符形态

`contributes.renderers` 与 `contributes.scripts` 是字符串数组，每项是插件内相对目录；目录下的 `*.json` 是描述符文件，内容为描述符数组。字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 插件内局部 kebab-case id；注册时加命名空间前缀 |
| `label` | 否 | 展示名 |
| `entry` | 是 | 插件内相对入口文件，禁绝对路径与 `..` 越界 |
| `export` | 是 | 入口文件导出的具名函数 |
| `purity` | 是 | `pure`（无副作用）或 `effectful` |
| `mode` | 是 | `sync` 或 `async` |
| `capabilities` | 否 | 宿主能力白名单条目，见 §2 |
| `input` / `output` | 否 | JSON Schema 形状的入参/出参约束；宿主校验它是对象，schema 由执行阶段消费 |
| `format` | 渲染器 | 导出格式 id（如 `rtf`） |
| `on` | 脚本 | 触发挂点（宿主声明的事件/接缝名） |

渲染器额外约束：`purity` 必须 `pure`、`mode` 必须 `sync`；脚本允许 `effectful` 与 `async`。

正例：

```jsonc
// manifest: { "contributes": { "renderers": ["./renderers/"] }, "permissions": { "ai": {} } }
[
  {
    "id": "rtf",
    "entry": "renderers/rtf.js",
    "export": "renderRtf",
    "purity": "pure",
    "mode": "sync",
    "format": "rtf",
    "input": { "type": "object" },
    "output": { "type": "string" }
  }
]
```

反例（逐条拒绝）：`purity: "effectful"` 的渲染器；`mode: "async"` 的渲染器；`entry: "../x.js"`；`export: "1bad"`；`capabilities: ["eval"]`；`capabilities: ["read:index"]` 但 `permissions.read` 未声明 `index`；`input: []`。

### 2. 能力模型

能力字符串是宿主契约的名字，不是宿主对象：

| 能力 | 需要的 manifest 权限 | 含义 |
|---|---|---|
| `read:<域>` | `permissions.read` 含该域 | 经宿主读数据域 |
| `write:<域>` | `permissions.write` 含该域 | 经宿主提议写入 |
| `net` | `permissions.network === true` | 经宿主受控网络门（`core/plugin/netGate.ts`） |
| `ai` | 声明 `permissions.ai` | 经宿主调用模型 |
| `tool:propose` | 无 | 提议工具调用，由宿主审批管线执行 |

白名单前缀之外一律拒绝；`net`/`ai` 不接受参数。能力与权限交叉回查：声明了描述符但没声明对应权限即拒绝注册。

### 3. 沙箱边界

复用既有底座，不引入第二套隔离：

- 执行引擎与资源限额：`main/app/pluginSandbox/quickjsRunner.ts`、`wasmRunner.ts`（QuickJS/WASM，`shared/sandbox.ts` 契约）。
- 权限与清单：`core/plugin/manifest.ts` 的 `validateManifest` 与 `PluginHost.assertCan`；插件上下文 `core/plugin/context.ts`。
- 网络与不可信：`core/plugin/netGate.ts`（默认拒绝、仅 https 与精确/子域匹配）、`core/ai/untrusted.ts`（外部内容围栏）。
- 工具提议：`core/plugin/sandbox/capabilities.ts` 的 `adjudicateHandlerResult` 过滤越界调用。

未签名可执行贡献 fail-closed：`renderers`/`scripts` 与 `logic`/`editor` 同规则，安装期缺来源认证签名即拒（`core/plugin/installer.ts`）。

### 4. 渲染器同步契约的选型

三个选项：

- A. 仅声明式渲染：渲染器只声明 `blocks + profile → 文本` 的模板/变换白名单，宿主解释执行；天然同步、零代码沙箱。
- B. 注册期声明 + 宿主同步调用已预热的纯函数：宿主在 QuickJS 实例中预热入口、解析导出函数，`render()` 期间同步调用；同步成立，但执行落在渲染进程内，牺牲进程隔离。
- C. 渲染器改异步契约：触及 build 管线与全部调用方，收益有限。

选型：取 B。渲染器描述符只接受 `pure + sync`，绑定推理如下。

- 纯函数无副作用，可预热、可缓存、可重复调用，与渲染的同步语义一致。
- `quickjs-emscripten` 已在依赖内（`package.json`），其 `evalCode` 同步执行并支持中断处理器，可在渲染进程内做超时与内存限额。
- 隔离取舍：执行不在 `utilityProcess`，因此只接受 `pure` 函数、不给宿主对象、不注入任何 I/O 宿主函数；超时中断、内存上限、输出上限三项齐备。
- 若 B 的隔离取舍不可接受，回落到 A（声明式，不跑任意代码）；这条回落只影响渲染器执行层，协议与注册表不变。

脚本不受同步约束，走既有 `utilityProcess` + QuickJS 异步沙箱。

### 5. 注册表与装配

协议层只登记描述符，不加载、不执行代码：

- `RendererRegistry` / `ScriptRegistry`（`core/plugin/registries.ts`）：注册返回 `Disposable`，查询、列举、按插件列举、释放；id 强制命名空间前缀（`<插件短名>.renderer.<id>` / `<插件短名>.script.<id>`）；重复 id 拒绝，过期句柄释放不误删替换项。
- `installExecutableDescriptors`：门序为「无声明放行 → 未签名拒绝 → 逐文件解析与校验 → 根目录作用域核对 → 命名空间重复检查 → 全部通过才登记」。任一描述符非法即整体不注册，原因可读。
- 执行器在后续阶段注入注册表，消费 `RegisteredExecutable.descriptor` 与插件资源；本层不持有可执行句柄。

### 6. 阶段拆分

| 阶段 | 范围 | 出口 |
|---|---|---|
| 协议层 | 描述符 schema、校验、能力模型、注册表占位 | 非法/越权描述符被拒，注册表生命周期与回滚可测 |
| 宿主接线 | 装配器读 `contributes.renderers`/`scripts`、签名与权限门、注册进注册表、禁用逆序释放 | 签名插件经真实管线注册，未签名无残留 |
| 沙箱执行 | 渲染器预热与同步调用；脚本经异步沙箱；资源限额与工具提议 | 纯函数渲染器产出文本；脚本读事件经审批写回 |

## 验收

协议层：

1. 合法描述符解析并规范化入口路径；非法 `purity`/`mode`/`entry`/`export`/schema 字段逐条拒绝并给出 JSON 路径。
2. 能力回查：未声明的数据域、`net`/`ai` 缺对应权限、白名单外能力（`eval`、`fetch`、`fs:`）全部拒绝。
3. 注册表：注册/查询/列举/释放可逆；重复 id 拒绝；命名空间隔离；过期句柄释放不误删。
4. 装配：未签名拒绝且无残留；越权、入口越界、非法 JSON、重复 id 整体拒绝；成功注册的 Disposable 逆序回滚。
5. 不执行任何插件代码（协议层无沙箱调用面）。

宿主接线：签名插件经真实发现-装配管线注册描述符，禁用/卸载逆序释放。

沙箱执行：渲染器纯函数同步产出；脚本死循环被中断、内存与输出超限被拒；工具提议经审批执行。

## 风险

- 命名空间碰撞：id 前缀取插件短名（末段），两个 id 末段相同的插件同名描述符会碰撞。注册表以重复 id 拒绝兜底；根因在 id 规则，归 04 篇命名空间。
- 同步执行的隔离削弱：选型 B 在渲染进程内跑纯函数。缓解为纯函数约束、无宿主对象、超时中断与资源上限；不可接受时回落选型 A。
- 描述符与执行漂移：`input`/`output` schema 由执行阶段消费，协议层只校验结构；漂移判定标准为执行层实际取值与 schema 不一致即 bug。
- 能力膨胀：能力前缀是白名单枚举，扩项须评审并同步权限门；不加「任意宿主函数」入口。

## 落地状态

- 协议层：描述符 schema 与校验（`core/plugin/descriptors.ts`）、注册表占位（`core/plugin/registries.ts`）、清单字段与签名门（`core/plugin/manifest.ts`、`core/plugin/installer.ts`）已就位，配单测。
- 宿主接线：装配器（`renderer/shared/services/pluginService.ts`）读 `contributes.renderers`/`scripts`，经 `installExecutableDescriptors` 登记到注册表；`PluginDeps` 持有两个注册表，`PluginHost` 暴露只读查询句柄。未签名或缺对应能力权限整体拒绝（fail-closed），禁用/卸载/热重载按注册逆序释放。登记层只存描述符，不执行代码。
- 沙箱执行：未做（见 §6）。
