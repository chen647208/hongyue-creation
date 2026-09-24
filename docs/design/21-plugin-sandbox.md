# 21 插件沙箱设计：隔离层级、候选方案与推荐架构

本文件回答一个问题：**逻辑型插件（JS/WASM）要在红月创作里跑，隔离怎么做才够工业化。**
信息来源为 2026-09 的公开文档与安全公告（来源汇总见 §7，许可证见 §5）。
本文件是前瞻设计；当前插件运行时仍只跑资源型（`04-plugin-system.md` §6）。

## 1. 威胁模型

插件是**用户安装的第三方代码**，默认不可信。要防的四类：

| 威胁 | 例子 | 要靠哪一层挡 |
|---|---|---|
| 宿主进程内存破坏 | 越界读写宿主堆、类型混淆 | 引擎隔离（独立 VM/进程） |
| 越权数据访问 | 读密钥、读别的书、扫用户目录 | 能力模型（默认拒绝） |
| 资源耗尽 | 死循环、内存炸弹、开一堆子进程 | 资源限额 + 进程监督 |
| 供应链投毒 | 替换插件包、域名投毒 | 签名校验 + 来源白名单 |

关键判断：**能力模型比引擎隔离更常被忽视，也更容易出错。** WASM/V8 给的是内存边界，一旦通过宿主函数把 `read_file(path)` 之类暴露出去，插件就等价于宿主。

## 2. 隔离层级（自内向外，层层设防）

```
① 引擎隔离：插件代码在独立 VM（QuickJS / V8 isolate）或独立 WASM 实例里，无宿主对象图
② 进程隔离：引擎跑在 Electron utilityProcess（不是主进程/renderer），崩溃只死该进程
③ 能力隔离：插件能调用的宿主函数是白名单（membrane 模式），其余全部不可见
④ 资源隔离：内存/CPU 时间/调用次数/网络字节 上限，超限即终止
⑤ 供应链隔离：包签名校验（sha256 → cosign/Sigstore）+ 来源白名单
```

五层缺一不可：只有①会被宿主函数出卖；只有③挡不住内存破坏；只有②挡不住资源耗尽。

## 3. 顶级项目怎么做（对标）

### 3.1 VS Code：进程隔离 + 纯 API 面

- 扩展跑在**独立 Extension Host 进程**（Electron `utilityProcess` 或 Web Worker + sandboxed iframe），与 UI 主线程分离，慢扩展不卡 UI。
- 跨进程只走 **RPC + 可序列化 DTO**，扩展拿不到主线程对象；激活事件懒加载。
- 定位是**稳定性与性能隔离**，不是安全沙箱：Node 扩展仍拿到完整 Node 能力。许可证 MIT。

可借：utilityProcess + RPC/DTO + 懒激活 + `extensionKind` 式的"运行位置偏好"。本项目已具备懒激活与状态机。

### 3.2 Figma：两段式（QuickJS-WASM 逻辑沙箱 + iframe UI）

- 逻辑跑在 **QuickJS 编译成 WASM** 的最小 JS 环境里：没有 `fetch`/`setTimeout`/DOM，**eval 由 QuickJS 自己执行**（无需宿主 `eval`，可配严格 CSP）。
- UI 跑在 **null-origin sandboxed iframe**，两段之间只走 `postMessage`（可序列化）。
- 核心是 **membrane 模式**：宿主 API 用约 500 行受审计的胶水层暴露，之后所有 API 都建在它之上，不再逐个审计；曾有 Realms 方案因原型链逃逸被放弃，转而用 WASM 解释器（"解释器可换、API 不换"）的备份设计。
- 许可证：Figma 专有，只借设计。

可借：两段式（逻辑 vs UI）、membrane、deterministic（协作编辑同输入同输出）、"解释器可替换"的接口抽象。

### 3.3 Extism：WASM 插件框架（现成件）

- 基于 wasmtime，插件是 `.wasm`（JS 作者经 `extism-js` 用 QuickJS-ng 快照编译）。宿主函数白名单、可控 HTTP（`AllowedHosts`）、超时、内存限制开箱可用。
- 定位就是"跑用户提供的不可信代码"，BSD-3-Clause。

可借：如果插件生态接受 WASM 形态，Extism 是最省事的成熟宿主。

### 3.4 Wasmtime + WASI Preview 2 / Component Model：最严格的类型化能力

- 每个资源访问都是**宿主签发的不可伪造 capability 句柄**（如 `wasi:filesystem` 的目录描述符），组件声明 `import` 才可能获得；WIT 是**可审计的权限清单**（`wasm-tools component wit` 静态可见）。
- 核心隔离（线性内存越界 trap）+ 显式导入 + `consume_fuel`/`epoch_interruption`/StoreLimits 做资源限额；Rust 实现，Apache-2.0 WITH LLVM-exception。
- 代价：宿主绑定与工具链偏重（Rust/`cargo component`/jco），比 JS 沙箱复杂。

可借：能力句柄 + WIT 清单 = 本项目"权限默认拒绝"的工业化形态。

### 3.5 isolated-vm：强力原语，但 2026 出了逃逸

- V8 isolate（独立堆、独立内建），内存限制、可多线程。ISC 许可证。
- **2026-08 披露 GHSA-864f-rcv7-6rh4（Critical）**：`ExternalCopy` 的 `transferList` 双重遍历导致类型混淆，从"宿主动态给一个 `ivm.Reference`"即可从 guest 逃逸到宿主，修复在 7.0.1 / 6.2.0。
- 项目自述处于 **maintenance mode**，且承认 V8 对 OOM 不健壮、需多进程兜底。
- 结论：**不作为唯一隔离边界**；若用，必须放独立低权限进程并跟进版本，且不要把 Reference/ExternalCopy 泄给 guest。

### 3.6 Node.js Permission Model：纵深防御，不是沙箱

- `--permission`（v23.5 起 Stable）限制 fs、子进程、worker、原生 addon、WASI、Inspector，默认拒绝；有 `--permission-audit` 审计模式。
- **官方明说**：不保证隔离恶意代码；不继承到 worker；`process._debugProcess()` 不受任何 scope 限制，可强制同用户下其它 Node 进程开 Inspector。
- 定位：给独立插件进程加一层"少做坏事"的纵深防御。

### 3.7 Electron utilityProcess + sandbox

- `utilityProcess` 用 Chromium Services API 起子进程（类 `child_process.fork`），崩溃隔离；`disclaim`（macOS）让 TCC 把子进程当独立实体，适合跑第三方代码。
- renderer 自 Electron 20 起默认沙箱；本项目 renderer 保持 `contextIsolation`。

## 4. 推荐架构

分阶段，先把"能安全跑"做出来，再谈生态。

```
┌────────────────────────────── 宿主（Electron main）──────────────────────────────┐
│  PluginHost（生命周期/状态机/Disposable 回滚，04 篇已具备）                          │
│  CapabilityBroker：把 manifest 声明 ∩ 用户授权后的能力，签发给沙箱                │
└───────────────┬───────────────────────────────────────────────┬──────────────────┘
                │ utilityProcess + MessagePort（RPC/DTO）        │ IPC（已有 plugin fs 代理）
┌───────────────▼───────────────────────────────┐   ┌───────────▼──────────────────┐
│ 逻辑沙箱（二选一，按插件形态）                   │   │ UI 沙箱（renderer 内）        │
│  A. WASM 组件（Wasmtime/Extism，能力句柄）      │   │  null-origin sandboxed iframe │
│  B. QuickJS-WASM（quickjs-emscripten）          │   │  postMessage 双向             │
│  资源限额：内存/燃料/墙钟/调用数/网络字节        │   │  仅可渲染，不碰宿主对象        │
└─────────────────────────────────────────────────┘   └───────────────────────────────┘
```

选型建议（按形态分流，而非二选一）：

| 插件形态 | 逻辑沙箱 | 理由 |
|---|---|---|
| 编译型/重逻辑 | **WASM Component Model（Wasmtime）** 或 **Extism** | 最成熟、能力可审计、性能好 |
| 轻量 JS 脚本 | **QuickJS-WASM（quickjs-emscripten）** | 作者门槛低、无原生 addon、可定时中断 |
| UI | sandboxed iframe | 浏览器厂商在维护这层隔离 |

无论哪条路，**共同硬约束**：

1. 沙箱一律跑在 `utilityProcess`，主进程只做 CapabilityBroker（macOS 开 `disclaim`）。
2. 能力默认拒绝，签发的是**句柄/白名单函数**，不是路径或对象；网络走宿主可控 HTTP（域名白名单 + 字节/超时上限）。
3. 资源限额四项齐备：内存、CPU（燃料或墙钟中断）、调用次数、网络流量；超限终止进程并记 `PluginError`。
4. 宿主函数的**入参按不可信处理**：长度上限、类型校验、边界检查；跨边界只传可序列化 DTO。
5. 包签名：`sha256` 摘要信封与 `ed25519` / `cosign` 来源认证信封三种算法；来源白名单，装前显式确认。
6. 保留本项目已有的**四道门 + 资源配额 + Disposable 回滚**，沙箱是它们的执行底座。

## 5. 许可证与来源

| 方案 | 许可证 | 复用方式 |
|---|---|---|
| VS Code | MIT | 可参考实现 |
| Wasmtime / WASI | Apache-2.0 WITH LLVM-exception | 可作为依赖 |
| Extism | BSD-3-Clause | 可作为依赖 |
| quickjs-emscripten / QuickJS | MIT | 可作为依赖 |
| isolated-vm | ISC | 谨慎，仅作纵深防御 |
| SES (Agoric) | Apache-2.0 | 可参考 |
| Electron / Node.js | MIT / MIT | 平台 |
| Node.js Permission Model | 内置 | 直接使用 |
| Figma 插件系统 | 专有 | **只借设计** |

## 6. 落地阶段与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| S0 | 仅资源型，不执行插件代码 | 禁用全部插件纯写作可用 |
| S1（已落地） | utilityProcess 逻辑沙箱 + QuickJS 引擎隔离 + 资源限额 + IPC | 死循环被中断、内存炸弹被内存上限拦截、输出超限拒绝；子进程无响应由主进程兜底 kill；宿主对象不可达 |
| S2（已落地） | WASM 轨：默认拒绝任何导入；授权导入须映射到受控宿主函数（`now`/`log`/`hash`）；死循环由进程超时兜底 | 未授权导入/缺实现被拒；授权后受控执行 |
| S3（已落地） | `PluginFrame`：null-origin `sandbox="allow-scripts"` iframe；插件 `contributes.ui` 的 `.html` 注册进 `plugin.panel` 槽位 | 插件 UI 无法触达宿主对象；禁用即卸载槽位 |
| S4（已落地） | Ed25519 签名信封 `plugin.sig` + 信任键白名单（设置面板可配，fail closed） | 篡改包/未信任公钥拒载；无签名包放行 |
| S5（已落地） | 多算法签名信封：`sha256`（完整性）+ `cosign`（Sigstore bundle，key 或 keyless，主进程调外部 cosign）；来源白名单（`plugins.allowedSources`） | 摘要不匹配/校验失败拒载；来源不在白名单拒载；cosign 缺失或缺信任锚即拒 cosign 信封 |

S2/S3/S4/S5 落点：`main/app/pluginSandbox/wasmRunner.ts`、`shared/ui/PluginFrame.tsx` + `uiSlots` 的 `plugin.panel`、`main/app/pluginSignature.ts` + `shared/pluginSignature.ts`、IPC `plugin-sandbox-run` / `plugin-verify-signature` / `plugin-digest-matches` / `plugin-cosign-verify`。信任键与来源白名单经设置面板保存（`plugins.trustedKeys` / `plugins.allowedSources`），bootstrap 时生效。

S1 实现落点：`core/plugin/sandbox/*`（契约与能力裁决）、`main/app/pluginSandbox/*`（QuickJS 运行时 + utilityProcess 宿主）、`shared/sandbox.ts`（跨层类型）、IPC `plugin-sandbox-run`。

每阶段独立 `npm run verify`；S1 起涉及进程与 IPC，跑打包冒烟与 E2E。

## 7. 来源

- VS Code Extension Host：https://code.visualstudio.com/api/advanced-topics/extension-host
- VS Code 架构（DeepWiki）：https://deepwiki.com/microsoft/vscode/5.1-extension-host-architecture
- Figma 插件如何运行（官方）：https://developers.figma.com/docs/plugins/how-plugins-run/
- Figma 插件系统构建（membrane/Realms）：https://www.figma.com/blog/how-we-built-the-figma-plugin-system/
- Extism 安全与宿主函数：https://www.systemshardening.com/articles/wasm/extism-plugin-security/
- WASI P2 能力模型：https://www.systemshardening.com/articles/wasm/wasi-preview-2-capabilities/
- WASM 平台扩展安全：https://www.systemshardening.com/articles/wasm/wasm-platform-extension-security/
- Wasmtime 安全设计：https://docs.wasmtime.dev/security.html
- isolated-vm 逃逸公告：https://github.com/laverdet/isolated-vm/security/advisories/GHSA-864f-rcv7-6rh4
- Endor Labs 分析：https://www.endorlabs.com/learn/ghsa-864f-rcv7-6rh4-critical-type-confusion-vulnerability-in-isolated-vm
- Node Permission Model：https://nodejs.org/api/permissions.html
- Electron utilityProcess：https://github.com/electron/electron/blob/main/docs/api/utility-process.md
- Electron 沙箱：https://electronjs.org/docs/latest/tutorial/sandbox
- quickjs-emscripten：https://github.com/justjake/quickjs-emscripten
