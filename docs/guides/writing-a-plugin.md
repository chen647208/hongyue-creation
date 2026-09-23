# 编写插件

本文是操作指南：从模板起一个插件，跑起来，再按需加贡献点。
契约细节见 `docs/design/04-plugin-system.md`，逻辑贡献协议见 `docs/design/22-plugin-logic-contributions.md`。

## 1. 从模板开始

复制 `examples/plugins/_template/` 到应用数据目录的 `plugins/<你的插件 id>/`：

1. 改 `plugin.json` 的 `id`（反向域名，如 `com.yourname.my-plugin`）、`name`、`description`、`license`。
2. 删掉不用的贡献目录与 `contributes` 对应键。
3. 重启应用，在 设置 → 插件 查看状态与错误。

完整示例见 `examples/plugins/opening-hook/`（覆盖全部贡献点）。

## 2. 贡献点速查

| 贡献 | 形态 | 执行位置 |
| --- | --- | --- |
| `types` | `types/*.json` 数组 | 类型注册表（自动加短 id 前缀） |
| `skills` | `SKILL.md`（+ 同目录 `handler.js`） | 清单常驻；正文与 handler 按需；handler 在沙箱 |
| `logic` | `logic/*.js` 具名函数 | 沙箱（`runPluginLogic` / hooks `do:'logic'`） |
| `editor` | `editor/index.html` | null-origin iframe，消息请求受控操作 |
| `hooks` | `hooks.json` | `inject` 常量注入；`logic` 调沙箱函数 |
| `settingsSchema` | manifest 字段（JSON Schema） | 设置面板按 schema 渲染 |

## 3. 沙箱与权限

- 逻辑代码在 `utilityProcess + QuickJS` 内运行，默认拒绝一切宿主能力；内存/时间/输出有上限，超限终止。
- handler / 逻辑函数只能返回数据或**建议的工具调用**（`toolCalls`），由宿主按权限裁决后在审批管线执行。
- 编辑器扩展无同源、无网络，只能 `postMessage` 请求白名单内的编辑器操作（如 `replaceSelection`）。

## 4. 资源与路径限制

- 路径必须相对且不含 `..`；单文件 ≤128KiB、单贡献键 ≤32 文件、总计 ≤96 文件 / 2MiB。

### 可执行贡献点必须签名

插件声明 `logic` / `editor` / `scripts` / `renderers` 任一可执行贡献点，目录里就必须有 `plugin.sig`，
否则安装被拒（`缺少签名：可执行贡献或强制签名要求的插件必须带 plugin.sig`）。只发资源
（`types` / `skills` 的 Markdown）的插件可以不签。

`plugin.sig` 是 Ed25519 detached 签名信封：`{ "algorithm": "ed25519", "signature": "<base64>", "publicKey": "<PEM>" }`，
签名对象是 `plugin.json` 的 UTF-8 文本。宿主判定两件事：签名能验过，且 `publicKey` 出现在
设置 → 插件 的信任清单里。清单为空时一律拒装。

发布者侧（私钥自留，公钥随插件分发）：

```bash
npm run plugin:keygen -- keys/my.pub keys/my.pem   # 只做一次；keys/ 加进 .gitignore
npm run plugin:sign -- keys/my.pem examples/plugins/my-plugin
npm run plugin:sign:check -- examples/plugins/my-plugin
```

使用者侧：把公钥文本整段（含 `-----BEGIN PUBLIC KEY-----` 头尾）贴进 设置 → 插件 的信任清单，
再把插件目录拷到应用数据目录的 `plugins/` 并重启。改了 `plugin.json` 必须重新签名，否则校验不过。

## 5. 许可：插件不必开源

- 宿主本体是 **AGPL-3.0**；插件 SDK（`@hongyue/plugin-sdk`）**独立 MIT**，与宿主解耦。
- 插件是独立作品，经公开 manifest / 协议交互、不链接宿主内部实现；**可自选许可（含闭源商业插件）**。
- AGPL 的义务针对"修改并分发宿主"；插件作者不因编写插件而被迫以 AGPL 授权自己的代码。
- 边界提示：若把宿主代码整体改写再分发，仍受 AGPL 约束。重大商业分发前请咨询法务。

## 6. 调试

- 禁用/启用为配置级操作，不删插件文件；禁用即逆序卸载全部贡献（unwind）。
- 状态面板显示每个插件的 `state` 与 `error.cause` 链；`failed` 只影响该插件。
- 升级插件后内容未变不会重载（内容哈希）；改文件需重启应用重新发现。
