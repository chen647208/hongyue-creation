# 51 安全授权收口：主进程持有的信任决策

## 问题

插件与文件系统「默认拒绝」的门本身实现完整（签名校验、路径包含检查、QuickJS 限额、网络白名单），但**授权决策的写权限暴露给了渲染层 IPC**。渲染层一旦被注入恶意脚本（资源型插件 HTML、未来的富文本渲染面），可以静默完成全部提权，无需用户参与：

| 提权路径 | 位置 | 后果 |
|---|---|---|
| `pluginTrustedKeysSync` 整体替换信任公钥清单 | `src/main/app/providers.ts` | 注入攻击者公钥后，任意自签插件通过来源认证 |
| sha256 信封被当作「来源认证」签名 | `src/main/app/pluginStore.ts` | 自算摘要即绕过「可执行贡献必须签名」 |
| `fs:allow-path` 无确认授权任意目录 | `src/main/app/providers.ts` | 一次 IPC 调用放行全盘读写删 |
| 沙箱限额被渲染层入参覆盖且无上限 | `src/main/app/pluginSandbox/host.ts` | `timeoutMs: 1e9` 常驻子进程、大内存值耗尽主进程 |
| 插件网络白名单被渲染层整体覆盖 | `src/main/net/pluginNet.ts` | `pluginFetch` 可向任意主机外传数据 |
| `ai:http` 无域约束且可把保险库 Key 拼进 URL | `src/main/ai/gateway.ts` | Key 经 query 外泄到任意域（易进代理/访问日志） |

## 设计

统一原则：**信任决策的写路径必须经过用户显式确认（主进程原生对话框）或被主进程钳制；渲染层对安全状态只有读路径。**

### 信任公钥清单（信任锚）

- 主进程独占持久化（`plugin-trusted-keys.json`），渲染层 IPC 收敛为：`list`（读）、`add`（每次一把公钥，主进程弹原生确认框，展示公钥指纹与来源提示）、`remove`（主进程确认框）。
- `pluginTrustedKeysSync`（整体替换）删除；渲染层 localStorage 里的清单副本只是缓存，启动时不再回填主进程（防「清空主进程清单后用旧缓存复活」），以主进程清单为唯一真源。
- 设置面板改为逐条粘贴单把公钥保存，每次保存触发主进程确认框。

### 签名分级

- 信封两级语义：**来源认证**（ed25519 受信公钥、cosign bundle）与**完整性校验**（sha256 摘要）。
- 可执行贡献（logic/editor/scripts/renderers）安装时只认来源认证；sha256 信封仅可用于与目录索引 `expectedDigest` 比对，自报摘要不再满足 `requireSignature`。
- 官方签发工具（`scripts/sign-plugin.mjs`）继续只产 ed25519。

### 文件系统授权

- `fs:allow-path` IPC 删除。目录授权只剩一个入口：`openDirectoryDialog`（用户在原生对话框里真实点选），返回路径照旧自动授权。
- 渲染层携带的「存储配置里的自定义数据目录」改由设置流程经对话框选择后落盘，启动时主进程按已持久化配置自行 `allowRoot`，不经渲染层转达。

### 沙箱限额钳制

- 主进程对 `request.limits` 逐项钳制：`timeoutMs`、`memoryBytes`、`maxOutputBytes` 上限即默认值（`PLUGIN_SCRIPT_*` 常量），入参只能下调不能上调。渲染层当前从不传 limits（全走默认），钳制不影响合法调用。

### 插件网络策略

- `netSetPolicy` 保留（设置面板需要编辑），但每次保存前主进程弹确认框，列出将放行的主机清单；确认后才落盘。

### ai:http 网关

- API Key 只进请求头；`apiKeyQueryParam` 机制删除（Gemini 这类 query-Key 供应商改由其适配器在头里携带或走专用通道）。
- 保险库 Key 的解引用与目标域绑定：请求必须声明 `apiKeyHost`（与模型配置的 baseUrl 同源），不匹配即拒绝发 Key，防 Key 被转投任意域。

## 验收标准

1. 渲染层被完全接管的前提下：无法写入/替换信任清单、无法让 sha256 包通过可执行插件安装、无法静默扩权文件目录、无法抬高沙箱限额、无法静默改网络策略、无法把保险库 Key 发往非配置域。
2. 合法流程不回归：设置面板仍可增删信任公钥（每次一次确认框）、经对话框选择的自定义数据目录仍可用、插件设置仍可调网络白名单（保存时一次确认框）、Gemini 供应商调用仍成功。
3. `npm run verify` 全绿；现有插件签名/安装/沙箱/网络单测全部通过并补齐新边界用例。
