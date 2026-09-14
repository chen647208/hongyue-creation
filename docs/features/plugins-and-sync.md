# 插件系统、同步与逐条目加密

> 本文覆盖插件系统、同步与逐条目加密的用户可见能力。设计蓝图见
> `design/04-plugin-system.md` 与 `design/03-data-layer.md`；验收证据见
> `guides/acceptance-report.md`。

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
  可执行贡献（logic/editor）要求来源认证签名（ed25519/cosign）；无签名包只放行资源型。
- **来源白名单**：设置 → 插件可维护 `manifest.source` 白名单（每行一个）；非空时来源不在清单的插件拒载。
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
- **发行档**：完整 / 网文 / 严肃文学 / 纯写作（minimal）。minimal 经
  `ai.request` 拦截器即时禁用全部 AI 请求（会话与工具），切回即恢复。
- **SDK**：`sdk/`（`@hongyue/plugin-sdk`，MIT 独立发行，与宿主 AGPL 解耦）。
- **用户写法技能**：设置 → 插件 → 写法技能。技能是数据不是代码——导入带 frontmatter 的
  `SKILL.md` 落到 `<userData>/skills/user/<slug>/SKILL.md`，命中触发词即注入；可删除。
  与内置技能并列展示（内置只读）。服务层 `assistant/services/userSkillsService.ts`，
  启动时装载进会话技能目录（`loadUserSkills`）。

## 同步

- **协议**：`src/core/sync` —— bundle = 变更记录（entity_changes 派生）+
  实体快照；`canonicalHash`（FNV-1a 稳定序列化）为跨设备合并判定依据。
- **合并规则（LWW 禁用）**：本地缺失→插入；内容一致→跳过；双方都改→
  **冲突副本**（本地保留，远端以 `conflict-<id>` 新 id 落库、属性随迁）；
  attrs/edges 冲突报告人工处理，绝不自动覆盖。
- **UI**：工作台顶栏 ⇄ 同步——导出同步包（JSON 另存为）/ 导入合并 +
  应用报告（已应用/已跳过/需人工 + 冲突副本清单）。
- **落库路径**：读写一律经 `shared/sql/catalog.ts` 的语句 id（`nodes/attrs/edges` 按书读取、`nodes.upsert`/`attrs.upsert` 写入），不传原始 SQL 文本。
- 当前边界：transport 仅文件交换实现（协议与传输已解耦，云传输实现本接口即可）；同步集限节点与属性，边不参与插入。

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
  → render（txt/md/html 内置；变换器与渲染器为插件贡献点）。
- 写作编辑器导出弹窗即管线适配器：含导出预览（md 渲染/html iframe/txt）
  与成稿字数——统计面板 `builtCharCount` 与导出同源（单一口径）。
- Profile 支持 JSON/YAML 双序列化（`.yml` 可 diff 可分享）。
