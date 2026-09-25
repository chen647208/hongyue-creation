# 27 IPC 信任边界加固（SQL 语义通道与文件收敛）

本文件源于已归档的审计快照（`docs/archive/26-maturity-gaps.md`，B4 安全项）：渲染层 → 主进程的 IPC
信任边界如何从"透传能力"收敛为"只暴露必要语义"。属于解释性设计（Diátaxis: explanation），
落地后回写 `docs/features`。

## 1. 现状与风险

- **裸 SQL 通道**：`preload` 把 `db.exec/run/all/get(sql, params)` 直接暴露给渲染层，
  主进程仅校验 `sql` 是字符串。渲染层若被 XSS 或恶意内容控制，即可执行任意 SQL。
  注：AI 生成在主进程执行，渲染层主要是本地应用代码；这是纵深防御项，不是当前可利用入口。
- **文件通道**：`readFile/writeFile/deleteFile/listDirectory` 接受任意绝对路径。
  导入/导出需要用户选定库外路径，因此不能简单一刀切。
- **CSP**：打包版 `connect-src` 为全通配（`https: http: ws: wss:`），
  覆盖用户可自定义的模型端点与本地/局域网服务。

## 2. SQL 语义通道

### 2.1 目标

渲染层不再能传任意 SQL 文本，只能按**已知语句标识**（catalog id）调用；主进程只执行
catalog 内的语句。等价能力不减少（现有全部查询都有对应条目）。

### 2.2 设计

- 语句目录单源 `src/shared/sql/catalog.ts`：`const SQL = { '<domain>.<statement>': '<sql>' } as const`，
  导出 `type SqlId = keyof typeof SQL`。schema DDL、迁移脚本、repository 的 CRUD/FTS 查询全部入表。
- 驱动契约改为按 id 调用：
  - 桌面 `IpcSqlDriver`：把 `{ id, params }` 发给主进程；主进程用 `SQL[id]` 查表执行，id 非法即拒。
  - 网页 `wasmDriver`：本地用同一 catalog 解析后执行（网页无主进程，catalog 是应用代码非用户输入）。
  - 事务批量 `db:batch` 同步改为 `{ id, params }[]`。
- **禁止动态拼接**：现有按条件拼 WHERE 的查询（如检索）改为固定语句 + 参数/null 占位，
  避免"渲染层再次生成 SQL"。这是本项的主要工作量与风险点。

### 2.3 验收

- 全仓 `driver.run/exec/all/get` 只接受 `SqlId`；`grep` 不再出现传入字符串 SQL 的调用。
- 主进程收到未知 id 时拒绝（单测覆盖）。
- 现有 repository 单测（含三后端一致性）全绿；E2E 持久化回归通过。

## 3. 文件 IPC 收敛

### 3.1 目标

文件读写默认只允许 `userData` 与"用户显式授权"的根：
- 数据目录（默认 `userData`，或用户自定义的存储路径）；
- 系统文件对话框刚返回的路径（导入/导出）。

### 3.2 设计

- 主进程维护"允许根集合"（realpath 规范化）：启动时加入 `app.getPath('userData')`。
- 对话框包装：`showOpenDialog`/`showSaveDialog` 返回的路径自动加入允许集合。
- 渲染层在加载/保存自定义存储路径时，经 `fs:allow-path` 注册该目录（主进程校验其存在且为目录）。
- 全部文件 handler（`readFile/writeFile/writeBinaryFile/deleteFile/listDirectory/fileExists`）
  入口调用 `assertPathAllowed`，越界抛错；`openPath` 维持仅 `userData`。
- 插件文件走既有独立路径门（`pluginFs`），不受影响。

### 3.3 验收

- 越界路径读写被拒（单测覆盖）；`userData`、自定义数据目录、对话框返回路径正常。
- E2E：持久化回归、导出/导入用例通过。

## 4. CSP 决策

AI 调用在主进程执行；渲染层只做模型列表/嵌入等直连，且端点是用户可自定义（含本地 Ollama、
局域网 http）。因此**静态 `connect-src` 收窄会误伤合法端点**。结论：

- 维持打包版 `connect-src` 宽松（现状），并在 `security.ts` 注释写明理由；
- 若要收窄，唯一正确做法是**按用户配置的端点动态生成 `connect-src`**（设置变更经 IPC 同步到主进程），
  作为独立项排期，不与本次改动混做。

## 5. 其他决定的记录（评估后不实现）

- **senderFrame 来源校验**：应用只有一个受信窗口，且已禁导航与新窗口（`window.ts` 的
  `will-navigate` 白名单与 `setWindowOpenHandler` deny）。能触达 `ipcMain` 的帧即该窗口；
  逐 handler 校验来源收益低、改动面大，故保持现状，把关放在窗口安全配置上。
- **`.npmrc ignore-scripts`**：`electron` 等依赖的 postinstall 是安装运行时所必需，全局禁用会破坏安装；
  故不采用，供应链防线落在 lockfile + `npm audit` + 许可证允许清单 + 密钥扫描。
- **崩溃转储**：保持本地留存（仅落 `userData`，不外发）；仅在上报开关开启且配置了 https 地址时才上传。
- **更新签名/公证**：需平台证书与 CI secrets，开源项目暂缓；待有证书再补 `publisherName`/`notarize` 配置。
- **动态 `connect-src`**：独立项（见 §4）。

## 6. 分期

| 阶段 | 内容 | 验收 |
|---|---|---|
| I1 | 文件 IPC 收敛（含自定义路径注册与对话框放行） | 越界拒绝；E2E 导出/导入、持久化通过 |
| I2 | SQL catalog 抽取 + 驱动契约按 id；消除动态拼接 | 未知 id 拒绝；全仓无字符串 SQL 调用；测试全绿 |
| I3 | 动态 `connect-src`（可选） | 仅放行已配置端点；无端点告警 |

## 7. 来源

- Electron 安全清单：https://www.electronjs.org/docs/latest/tutorial/security
- Content-Security-Policy `connect-src`：https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy/connect-src
- CycloneDX 规范：https://cyclonedx.org/docs/1.5/json/
