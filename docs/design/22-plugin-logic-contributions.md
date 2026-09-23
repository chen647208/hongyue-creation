# 22 插件逻辑贡献协议：editor 扩展与逻辑 hooks

本文件规定逻辑型插件贡献点的协议（what/why/验收）。实现依赖 `21-plugin-sandbox.md` 的 S1 沙箱
（utilityProcess + QuickJS）与 S3 UI 宿主（`PluginFrame`，null-origin iframe）。
`04-plugin-system.md` 的贡献点 #6（编辑器扩展）与 #8（hooks）在此细化。

## 1. 为什么分两条执行通道

- **数据/计算型逻辑**（hooks 决策、文本变换、校验）：跑在 **QuickJS 沙箱**，无 DOM、无宿主对象；
  只能读入参、返回结果或**提议工具调用**（与双轨技能同协议）。
- **需要 DOM 的编辑器扩展**（TipTap/CM6 插件、面板）：跑在 **null-origin sandboxed iframe**，
  经 `postMessage` 与宿主通信；宿主侧负责把消息翻译成受控编辑器操作。

QuickJS 无法提供 DOM，iframe 无法触达文档模型——两者分工，缺一不可。这也是 Figma 两段式的同款结论。

## 2. manifest 声明

```jsonc
{
  "contributes": {
    "logic":   ["./logic/"],            // 每文件导出若干具名函数（沙箱执行）
    "editor":  ["./editor/"],           // 每目录含 index.html（iframe 内运行）
    "hooks":   "./hooks.yml"            // 声明式策略（已有）；可引用 logic 函数名
  },
  "permissions": {
    "read": ["manuscript", "cards"],
    "write": ["cards"],
    "ai": { "quotaPerHour": 10 }
  }
}
```

规则：
1. `logic` 文件在装载期读入（受路径门与资源配额约束），**不执行**；调用时才进沙箱。
2. `editor` 目录必须含 `index.html`；宿主以 `PluginFrame` 渲染，默认无网络、无同源。
3. 逻辑函数的可用能力 = manifest `permissions` ∩ 宿主授权；越权调用返回 `capability` 错误。

## 3. 逻辑函数调用协议

- 宿主 API：`runPluginLogic(pluginId, fnName, input) → SandboxRunResult`（复用 IPC `plugin-sandbox-run`）。
- 逻辑文件约定导出 `function <fnName>(input) { return output | { output, toolCalls } }`。
- 返回值经 `adjudicateHandlerResult` 过滤：`toolCalls` 只保留权限内工具，越界记 `capability` 错误；
  **宿主执行工具调用，插件不直接触达数据**（与 `05 §9.2` 双轨技能一致）。
- hooks 可写 `{ on: 'ai.request', do: 'logic', fn: 'injectStyle' }`：接缝命中时宿主调用该函数，
  用其返回值做注入/过滤；函数抛错只禁用该 hook，不拖垮会话。

## 4. 编辑器扩展协议（iframe）

- 宿主 → 扩展：`{ type: 'init', payload: { theme, locale, document } }`、`{ type: 'apply', ops: [...] }`。
- 扩展 → 宿主：`{ type: 'ready' }`、`{ type: 'request', ops: [...] }`（宿主校验后经编辑器事务管线应用）。
- 宿主只接受来自该 iframe `contentWindow` 且形状合法的消息；扩展拿不到宿主对象。
- 编辑器操作白名单：插入/替换文本、读取选区、滚动定位；不暴露任意 DOM/文件/网络。

## 5. 生命周期与回滚

- 逻辑贡献随插件 `activate` 装载、`disable/uninstall` 逆序释放（`ContributionSink` 已具备）。
- 沙箱进程按次 fork，超时/内存越界由 `SandboxHost` 终止，不影响主进程。
- iframe 随插件禁用卸载。

## 6. 验收标准

1. 示例插件 `logic/` 导出的函数可经 `runPluginLogic` 执行并返回输出；未声明权限的工具调用被拒。
2. 逻辑函数死循环/内存炸弹被沙箱终止，主进程仍可响应（S1 已具备，补插件级用例）。
3. 示例 `editor/` 在 `PluginFrame` 中渲染，`ready` 后可请求一次文本插入并被宿主应用；越权消息被忽略。
4. 禁用插件后逻辑贡献与编辑器 iframe 一并消失，重启不残留。

## 7. 落地状态

1. `contributes.logic` 收集 + `runPluginLogic` 服务（复用沙箱与裁决）+ 单测：**已落地**；
   并经内置工具 `core.plugin.run` 接入助手（宿主注入 `services.pluginRun`）。
2. hooks 的 `do: 'logic'` 分支：**已落地**（`installHooks` 落 `logic` 策略；`aiSessionManager` 组装前经沙箱调用并将返回文本注入 system）。
3. `contributes.editor` + iframe 消息协议 + 编辑器操作白名单：**已落地**（`PluginEditorFrame` + `editorOps` 校验/总线 + 写入区 `plugin.editor` 槽位；越权操作被过滤）。

## 8. 现有边界（现在时）

- 逻辑贡献仅开放**计算与提议**，不提供宿主数据直读宿主函数；数据访问走提议工具调用。
- 编辑器扩展的 iframe 无同源、不触达宿主 DOM；声明 `permissions.network` 后经宿主受控 HTTP 联网，其余情况无网络。
