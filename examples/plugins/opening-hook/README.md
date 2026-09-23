# 开篇钩子示例插件

官方示例（MIT）：演示红月创作的**全部贡献点**，含沙箱执行的逻辑型贡献。
安装前必须签名（本插件带 `logic` 与 `editor` 可执行贡献点），步骤见下。

## 安装（含签名）

```bash
# 1. 生成一把密钥对（只做一次；私钥自留，公钥给宿主信任）
npm run plugin:keygen -- keys/demo.pub keys/demo.pem

# 2. 用私钥给本插件签名，产出 plugin.sig
npm run plugin:sign -- keys/demo.pem examples/plugins/opening-hook

# 3. 把 keys/demo.pub 的内容整段贴进 设置 → 插件 的信任清单

# 4. 整目录拷到应用数据目录的 plugins/ 下并重启，在 设置 → 插件 查看状态
```

签名对象是 `plugin.json` 的 UTF-8 文本；改动 `plugin.json` 后要重跑第 2 步，否则安装被
「签名校验失败」拒绝。公钥不在信任清单同样拒装——信任清单为空时一律拒装。

## 贡献点

- `skills/opening-hook/`：双轨技能——`SKILL.md`（资源轨，渐进注入）+ `handler.js`（逻辑轨，沙箱执行）。
  handler 返回 `{ output, toolCalls }`；`toolCalls` 只保留技能 `tools` 白名单内的调用。
- `logic/hooks.js`：插件逻辑贡献，导出 `injectOpeningRules` / `summarize`；接缝或工具 `core.plugin.run` 调用时才进沙箱。
- `hooks.json`：`do: inject` 常量注入 + `do: logic` 调用逻辑函数（会话组装前经沙箱解析）。
- `editor/index.html`：编辑器扩展，运行在 null-origin iframe；只能 `postMessage` 请求受控编辑器操作
  （`replaceSelection`），越权操作由宿主过滤。
- `types/opening.json`：`opening-beat` 类型模板（装载时自动加 `example-opening-hook.` 前缀）。
- `settingsSchema`：设置面板按 schema 渲染表单，值存 `plugin.<id>.settings`。

## 安全边界

- 逻辑与技能 handler 在 **utilityProcess + QuickJS 沙箱**内运行，默认拒绝一切宿主能力；
  只接受返回的建议工具调用，由宿主在审批管线执行。
- 编辑器扩展无同源、无网络；不触达宿主 DOM。

## 许可

插件自身 MIT；宿主 SDK（`@hongyue/plugin-sdk`）独立 MIT 发布，与宿主 AGPL-3.0 解耦。
