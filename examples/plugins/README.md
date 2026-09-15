# 示例插件

- `magic-system/`：资源型（类型模板 + 写法技能），零代码。
- `opening-hook/`：全贡献点（双轨技能、逻辑 hooks、编辑器扩展、设置 schema），逻辑在沙箱执行。
- `wasm-skill/`：WASM 轨技能（`handler.wasm` 纯计算、无导入），源码 `handler.wat` 经 `npm run wasm:build` 编译。
- `web-search/`：资源型（技能 + `permissions.network`），演示经受控网络门 `core.net.fetch` 做联网搜索/翻译。
- `_template/`：新插件脚手架，复制改名即用。

安装：整目录拷到应用数据目录的 `plugins/` 下并重启。许可与边界见各目录 README 与
`docs/guides/writing-a-plugin.md`。
