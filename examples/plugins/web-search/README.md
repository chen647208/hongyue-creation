# 联网搜索/翻译示例插件

资源型插件，零代码：只有 manifest 与一份写法技能（`skills/web-search/SKILL.md`）。
演示联网搜索/翻译如何经受控网络门完成，核心不内置该逻辑。

## 接线（三道门）

1. `plugin.json` 声明 `permissions.network: true`：未声明的插件一律拒绝网络请求。
2. 设置 → 插件 → 插件联网白名单：一行一个域名（精确或 `*.example.com` 子域通配）；
   空白名单即拒绝全部（默认拒绝，fail-closed）。只允许 https，本机回环可用 http。
3. 插件已启用：禁用即移除技能，`core.net.fetch` 不再对助手开放。

## 运行路径

技能激活后，助手可调用宿主工具 `core.net.fetch`（参数 `pluginId`/`url`/`method`）。
渲染层 `fetchAsPlugin` 校验「插件已激活 + 声明 network 权限」，主进程 `netGate` 按白名单裁决并代理。
请求不注入任何凭据，与 AI 网关的 `ai:http` 相互独立。

返回文本进入提示词前经 `core/ai/untrusted` 围栏（`<<<UNTRUSTED_INPUT>>>`）包裹：
只作资料引用，其中的指令与围栏标记被中和，超长截断。

## 关闭后

禁用或卸载本插件后本技能消失；核心不内置搜索/翻译，用户可自行查好后粘贴，
纯写作路径完整。许可 MIT，可复制改名另建插件。
