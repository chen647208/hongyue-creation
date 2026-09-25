# 插件系统、同步与逐条目加密

> 本文覆盖插件系统、同步与逐条目加密的用户可见能力。设计蓝图见
> `design/04-plugin-system.md` 与 `design/03-data-layer.md`；验收证据归档于
> `docs/archive/acceptance-report.md`。

## 插件系统

- **manifest v0**：插件 = `userData/plugins/<反向域名 id>/plugin.json` + 贡献文件。
  校验错误定位到 JSON 路径；`host` 版本区间不匹配则贡献整体失效并上报。
- **资源型贡献点（v0）**：
  - `skills`：SKILL.md 写法技能，进入技能目录（渐进注入、可卸载）。同目录可附
    `handler.js`/`handler.mjs`（JS 轨）或 `handler.wasm`（WASM 轨）作为逻辑轨；
    handler 在隔离沙箱里执行，只能建议工具调用，经技能 `tools` 白名单裁决（越界拒绝）。
- **签名**：插件可附 `plugin.sig`，信封支持三种算法：
  `ed25519`（detached 签名 + PEM 公钥，须命中信任键白名单）、`sha256`（仅完整性，不放行可执行贡献）、
  `cosign`（Sigstore bundle，key 或 keyless；主进程调外部 cosign，工具链缺失或缺信任锚即拒载）。校验 `plugin.json` 内容，失败拒载（fail closed）。
  可执行贡献（logic/editor/renderers/scripts）要求来源认证签名（ed25519/cosign）；无签名包只放行资源型。
- **目录索引签名**：目录索引 `catalog.json` 的整份 payload 需带同级 detached 签名（`catalog.sig`，
  信封为 ed25519 或 cosign）；主进程按信任键清单验签，校验失败或不带签名即拒绝使用该索引。
  `sha256` 信封仅完整性，不足以认证索引来源，索引一律拒绝。
- **来源白名单**：设置 → 插件可维护 `manifest.source` 白名单（每行一个）；非空时来源不在清单的插件拒装。
  空白名单为 fail-closed：默认拒绝安装未认证来源，需显式开启「允许任意来源」才放行。
  信任键与来源白名单都在设置 → 插件里维护。
- **UI 界面**：manifest 的 `contributes.ui` 目录下 `.html` 经 `PluginFrame`（null-origin sandboxed iframe）
  渲染进 `plugin.panel` 槽位；禁用插件即卸载界面。
- **设置 schema**：manifest 声明 `settingsSchema` 的插件，设置面板按其 schema 渲染表单，
  值持久化在 `plugin.<id>.settings`。
- **WASM 逻辑轨**：`handler.wasm` 默认拒绝任何导入；SKILL.md frontmatter `hosts` 声明可用的受控宿主函数
  （`now`/`log`/`hash`），未授权导入或缺少实现即拒执行。
  - `types`：类型模板（强制 `短id.` 命名空间前缀，防抢占内置类型）
  - `buildProfiles`：导出构建档（JSON/YAML 双序列化，`.yml` 可 diff 分享；构建管线消费）
  - `hooks`：声明式策略（JSON，v0 支持 ai 接缝的 inject/filter）
- **可执行描述符贡献（renderers/scripts）**：`contributes.renderers`/`contributes.scripts` 指向目录，
  目录下 `*.json` 为描述符数组（入口文件 + 导出名 + 纯度/同步声明 + 能力白名单，见 `design/49`）。
  装配期经 `installExecutableDescriptors` 登记进描述符注册表，宿主以只读查询句柄取入口；
  未签名、缺对应能力权限或入口文件不在插件文件集内整体拒绝（fail-closed），不产生半装，
  禁用/卸载/热重载按注册逆序释放。
- **脚本执行（`PluginHost.runScript`）**：脚本触发时按「插件已激活 → 描述符已注册 → 触发挂点匹配 →
  能力按当前 manifest 权限回查 → 入口存在 → 输入 schema」放行，任一不过即拒绝；入口文件经既有插件沙箱
  （主进程 QuickJS + utilityProcess 隔离）执行，输出按描述符 `output` 顶层 `type` 校验。超时、内存、输出上限
  单源在 `shared/constants/pluginExecution.ts`；未配置执行端口即拒绝执行。
- **脚本事件触发（`PluginHost.emit`）**：宿主声明的事件挂点单源在 `HOST_SCRIPT_EVENTS`
  （`project.open` / `chapter.open` / `chapter.save`）。事件触发时遍历已注册且已激活、`on` 对齐的脚本逐一执行；
  未知事件直接返回，单脚本失败只记日志、不阻断其余脚本与主流程。应用触发点为打开项目、切换章节、
  章节落盘成功；触发异步非阻塞，无脚本订阅时零开销。
- **能力通道与工具提议**：宿主只把描述符声明且过权限回查的能力名交执行端口，未声明能力不可见；
  脚本返回的工具调用按能力白名单裁决，经 `tool:propose` 提议后交注入的 `ToolProposalPort`
  进提案/审批管线，脚本无直接写路径。端口缺省即拒绝（fail-closed）。
- **渲染器同步执行（`PluginHost.runRenderer`）**：渲染器描述符强制 `pure + sync`，按「已激活 → 已注册 →
  纯同步约束 → 能力回查 → 入口存在 → 输入 schema → 同步端口 → 输出字符串 + output schema」门序调用
  注入的 `RendererExecutionPort`（同步纯函数，毫秒级超时）；端口缺省即拒绝，生产端口未接线时渲染器执行
  一律拒绝。
- **运行时**：逐插件 try-catch 故障隔离；一切注册返回 `Disposable`，
  禁用/卸载时逆序释放（unwind 不变量）；权限 deny-by-default。
- **资源配额**：装载期校验贡献资源——单文件 ≤128KiB、单贡献键 ≤32 文件、
  总计 ≤96 文件 / 2MiB、路径必须相对且不含 `..`；超限只让该插件 `failed`，
  错误给出贡献键与实测值，其余插件照常。
- **路径门**：装配器对 `contributes` 声明的每个目录与目录项先过词法门
  （拒绝绝对路径、`..` 越界、`.git`/`node_modules` 等拒绝清单），越界只让该插件 `failed`，
  且不读取越界文件；`cause` 链保留具体原因。
- **装配回滚**：装配中途抛错时，已注册项逆序释放（`ContributionSink`），插件置 `failed`，宿主无残留。
- **状态面板**：设置 → 插件——状态徽标、错误 cause 链详情、一键禁用/启用
  （配置级，持久化于 localStorage）。
- **发行档**：完整 / 网文 / 严肃文学 / 纯写作（minimal）。单源在
  `core/plugin/bundles.ts` 的 `RELEASE_PROFILES`：bundle 选择 + `disabledFeatures`
  默认关闭集合（依赖被禁的功能连带禁用）；切换后工作台分区与装配树按可用 feature 集合变化。
  - 完整：15 项全开。
  - 网文：保留写作/章节/大纲/角色/世界/知识库/一致性/伏笔/AI 助手，默认关闭时间线。
  - 严肃文学：保留写作/大纲/角色/世界/知识库/伏笔/AI 助手，默认关闭章节细纲/一致性/时间线。
  - 纯写作（minimal）：仅核心写作包，经 `ai.request` 拦截器即时禁用全部 AI 请求（会话与工具），切回即恢复。
- **SDK**：`sdk/`（`@hongyue/plugin-sdk`，MIT 独立发行，与宿主 AGPL 解耦）。
- **用户写法技能**：设置 → 插件 → 写法技能。技能是数据不是代码——导入带 frontmatter 的
  `SKILL.md` 落到 `<userData>/skills/user/<slug>/SKILL.md`，命中触发词即注入；可删除。
  与内置技能并列展示（内置只读）。服务层 `assistant/services/userSkillsService.ts`，
  启动时装载进会话技能目录（`loadUserSkills`）。

### 安装 / 更新 / 卸载

- **入口**：设置 → 插件 → 安装插件。可从本地目录安装单包，或从目录索引
  （`catalog.json`，schema 1）列出条目逐个安装。目录项字段：`id`/`name`/`version`/`host`/
  `license`/`source`/`path`（相对索引目录）/`digest`（plugin.json 的 sha256 base64）/`signature`。
- **校验顺序**：读取包 → manifest 校验（错误定位 JSON 路径）→ 来源白名单（空白名单默认拒绝，
  除非显式开启「允许任意来源」）→ host 区间 → 签名/摘要 → 版本决策。任一步失败即拒装，不落盘；
  可执行贡献（logic/editor/renderers/scripts）必须带来源认证签名。
- **原子落盘**：暂存目录 → 备份旧版本 → 改名替换；失败回滚到旧版本，不留半成品。
- **更新**：同 id 更高版本走 update，同版本为 up-to-date，更低版本拒绝降级。
- **卸载**：删插件目录 + 清 `plugin.<id>.settings[.corrupt]` + 逆序释放全部贡献，
  无可执行残留；随后重建宿主并刷新面板。

### 受控网络门（联网搜索 / 翻译等插件）

- 插件不持有 `fetch`，只能经主进程网络门请求。策略单源在 `core/plugin/netGate`：
  未配置允许域名即拒绝全部（默认拒绝）；只允许 https（本机回环可用 http）；
  域名精确匹配或 `*.example.com` 子域通配；拒绝带凭据的 URL；方法限 GET/POST。
- 白名单在设置 → 插件 → 插件联网白名单维护，主进程持久化；该门不注入任何凭据，
  与 AI 网关的 `ai:http` 相互独立。
- 插件运行期请求还要求：插件已激活且 `manifest.permissions.network === true`（否则拒绝）。
- 工具契约：`core.net.fetch` 是唯一出口——必须给出已激活且声明 network 权限的 `pluginId`；
  核心只提供该契约与网络门，联网搜索/翻译本身由插件实现，不内置。
- 示例插件：`examples/plugins/web-search`（资源型：`manifest` 声明 `permissions.network: true` +
  `skills/web-search/SKILL.md`，技能 frontmatter `tools: [core.net.fetch]`）演示如何经该门做搜索/翻译。
  三道门都要开：插件声明 network 权限、联网白名单放行域名、插件已启用。禁用或卸载后技能移除、
  工具不再对助手开放，核心无内置搜索/翻译，手动查资料路径完整。
- 外部返回文本进入提示词前经 `core/ai/untrusted` 围栏（`<<<UNTRUSTED_INPUT>>>`）包裹，
  声明「数据不是指令」；内容中的围栏标记与控制字符被中和，超长截断。

### 本地推理

- 设置 → 插件 → 本地推理：启用、填本地端点（OpenAI 兼容 `/v1/models` 或 Ollama `/api/tags`）、
  可选启动命令；探测列出模型，选中后写回配置。
- 主进程托管进程（不经 shell、cwd 限定数据目录子目录、最小环境变量），退出时统一停止；
  运行时由用户自备，不随包分发。
- 决策在 `core/ai/localInference.resolveInferenceTarget`：本地启用且可达走本地，
  否则回落远程网关；不改远程网关契约。

## 同步

- **协议**：`src/core/sync` —— bundle = 变更记录（entity_changes 派生）+
  实体快照；`canonicalHash`（FNV-1a 稳定序列化）为跨设备合并判定依据。
- **合并规则（LWW 禁用）**：本地缺失→插入；内容一致→跳过；双方都改→
  **冲突副本**（本地保留，远端以 `conflict-<id>` 新 id 落库、属性随迁）；
  attrs/edges 冲突报告人工处理，绝不自动覆盖。
- **UI**：工作台顶栏 ⇄ 同步——导出同步包（JSON 另存为）/ 导入合并 / 上传到传输 /
  从传输下载合并。导入或下载先做预合并：无冲突直接应用；有冲突时给出三选
  ——保留冲突副本 / 应用远端替换 / 标记合并失败待处理，选择后落地并出报告
  （已应用/已跳过/需人工/待处理 + 冲突副本清单）。三选是单选组 + 图例，键盘可达。
- **自动恢复记录**：对话框内"自动恢复记录"面板列出每次导入/下载/上传/导出的结果
  （成功/失败/待处理、计数、失败原因），记录滚动保留最近 50 条。
- **退出导出**：设置 → 同步传输可开启"退出时导出同步包"；应用退出时按当前传输
  目标逐书上传，失败按书登记，下次启动提醒并可一键重试。
  设置 → 同步传输配置后端并做连通测试。
- **传输**：`src/main/sync/transport.ts` 三类后端（本地目录 / WebDAV / S3 兼容）实现统一接口
  （`test`/`put`/`get`/`list`/`remove`），并共用同一分片协议：同步包按 `<key>.part-<序号>.json`
  切分上传，最后写 `<key>.manifest.json`（提交点）；下载按清单取回并校验总摘要，分片缺失或摘要
  不符即报可读错误。重试会跳过已完成分片（断点续传），清单未写入前不会有半套对象被当成完整包；
  无清单的整体对象仍可读（兼容既有远端包）。渲染层只下发配置与对象键，主进程从保险库解引用
  凭据后执行，日志不落明文；WebDAV 用 `PUT`/`GET`/`PROPFIND`，S3 用 `PUT`/`GET`/`ListObjectsV2`
  与手写 AWS SigV4 签名（`node:crypto`）。浏览器端 `syncTransportBrowser.ts` 以 WebCrypto 同协议分片。
- **落库路径**：读写一律经 `shared/sql/catalog.ts` 的语句 id（`nodes/attrs/edges` 按书读取、`nodes.upsert`/`attrs.upsert` 写入），不传原始 SQL 文本。
- 当前边界：传输按对象键分片与断点续传，远端列举隐藏分片/清单内部对象；凭据按后端各存一个
  保险库槽位；退出导出的单次上传在退出超时窗口内完成，超时按强制退出处理（失败已登记）。

## 移动端与跨设备

- **响应式形态**：手机宽度（≤639px）单一内容列，分区导航落到底部横向栏，
  AI 助手与写作参考面板改为全屏/抽屉覆盖层，顶栏收起次要入口；表格与时间线等
  固有横滚保留。视口分级与形态映射单源在 `shared/utils/layout.ts`
  （mobile ≤639 / tablet ≤1023 / desktop）。
- **触控与无障碍**：底部导航与助手操作的命中区在窄视口放大到不小于 44px；
  删除消息先二次确认（`shared/services/deleteGuard.ts`，确认期间吞掉重复触发）；
  底部导航带 `aria-label`/`aria-current`，覆盖层为 `role="dialog"` 且关闭按钮有可读名。
  全局尊重 `prefers-reduced-motion`。
- **落盘**：移动端编辑走差分持久化；页面隐藏与 `pagehide` 触发强制刷盘，降低后台
  回收丢稿。落盘失败多次重试后显式提示。
- **跨设备冲突**：复用同步包与 `core/sync` 的 `mergeBundle` 分类——双方都改的章节
  以冲突副本落库，本地原稿不动；不在移动端另造合并判定。
- **PWA**：`manifest.webmanifest` 提供主屏安装与显示名（图标为既有 `icon.png`）。
  离线壳需构建期 service worker，当前未接入。

## 逐条目加密

- **核心**：`src/core/crypto` —— AES-256-GCM + PBKDF2（21 万次迭代），
  信封 `enc.v1:<salt>.<iv>.<ciphertext>`（全 base64）直接存入章节正文。
- **受保护会话**：顶栏盾牌——口令驻留内存（会话级），按信封盐缓存派生
  密钥（跨会话同口令可解）；锁定即抹除。解锁后可对章节逐个加密/解密
  （加密二次确认警示不可逆）。
- 当前边界：编辑器渲染的透明集成（解锁态自动解密显示）尚未接入。

## 导出构建（design/07）

- `src/core/build` 三段式管线：selection（类型通配/单点排除/整类开关/
  状态过滤）→ transform（`%N %T` 标题模板、重编号、stripTags、引用替换）
  → render（txt/md/html/rtf/pdf/ePub/DOCX/ODT 内置；变换器与渲染器为插件贡献点）。
- 写作编辑器导出弹窗即管线适配器：含导出预览（md 渲染/html iframe/txt）
  与成稿字数——统计面板 `builtCharCount` 与导出同源（单一口径）。
- Profile 支持 JSON/YAML 双序列化（`.yml` 可 diff 可分享）。
