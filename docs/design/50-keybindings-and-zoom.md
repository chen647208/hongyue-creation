# 50 键位自定义与缩放接管

## 背景与问题

打包运行屏蔽浏览器式快捷键（`src/main/app/shortcuts.ts`）后仍有两处浏览器味：

- 缩放：Chromium 的捏合手势与 `Ctrl/Cmd+滚轮` 直接改可视缩放因子，界面与菜单栏无关地整体放大，和「界面字号」设置各说各话。
- 键位：全局快捷键的处理散在 `App.tsx`（助手、分区、命令面板）、`useFindReplace.ts`（查找）与 `ShortcutRecorder.tsx`（录制）。绑定串只支持 `ctrl+单键`，表达不了 `Ctrl+Shift+K`、`Ctrl+=`、`Ctrl+0`；用户改键只覆盖 7 条动作，没有序列化形状，也不提示浏览器保留组合。

## 目标

- 缩放单一口径：Chromium 缩放关闭，应用内缩放复用既有 `uiFontSize` 设置，给出快捷键与设置入口。
- 键位系统收敛到纯函数模块：命令目录、默认绑定、绑定串解析与匹配、冲突检测、序列化与反序列化。
- 用户可改键、单条/整体恢复默认；冲突组合与浏览器保留组合给出提示并拒绝保存。
- 未配置时逐字沿用既有按键行为（`Ctrl+J` 助手、`Ctrl+1..5` 分区、`Ctrl+F` 查找、`Ctrl+K` 命令面板）。
- 键位是安装级界面偏好，走 `localStore` 单出口。

## 非目标

- 不做键位方案导入导出与多套配置切换。
- 不做命令面板内的键位展示或快捷键帮助浮层。
- 不改编辑器内核（CodeMirror/TipTap）内部的编辑键位，这些键位不进入全局命令目录。
- 不做主进程与渲染层的键位运行时同步；浏览器保留组合在录制期直接拒绝。
- 不引入第三方键位库。

## 设计

### 1. 缩放接管

两层各自封口：

- 主进程 `installZoomGuard`（`src/main/app/shortcutGuards.ts`）：`webContents.setVisualZoomLevelLimits(1, 1)` 关掉捏合缩放。最小菜单去掉 `zoomIn/zoomOut/resetZoom` 角色，缩放加速键不注册；开发运行保留 `toggleDevTools` 一项，其余与打包一致。
- 渲染层 `useZoomGuard`（`src/renderer/shared/hooks/useZoomGuard.ts`）：`wheel` 以 `{ passive: false, capture: true }` 监听，`event.ctrlKey || event.metaKey` 时 `preventDefault()`。主进程拿不到 wheel 事件，这是唯一的拦截点。

应用内缩放不引入第二套状态，全部落到 `uiFontSize`：

| 命令 | 默认绑定 | 行为 |
|---|---|---|
| `zoomIn` | `Ctrl+=` | `uiFontSize + step`，上限 `UI_FONT_SIZE.max` |
| `zoomOut` | `Ctrl+-` | `uiFontSize - step`，下限 `UI_FONT_SIZE.min` |
| `zoomReset` | `Ctrl+0` | 回到 `UI_FONT_SIZE.default` |

范围与步长单源在 `src/shared/constants/uiScale.ts`，设置页滑块与快捷键共用；正文字号 `editorFontSize` 仍是阅读舒适度设置，不参与界面缩放。

### 2. 键位系统分层

`src/renderer/shared/keymap/`：

- `types.ts`：`KeybindingActionId`、`KeybindingMap`、`KeyEventLike`、`ParsedBinding`。
- `commands.ts`（纯数据/纯函数）：命令目录 `KEYBINDING_COMMANDS`、`DEFAULT_KEYBINDINGS`、`resolveKeybindings`、分组 `groupKeybindingCommands`。
- `bindings.ts`（纯函数）：`parseBinding`、`normalizeBinding`、`serializeBinding`、`eventToBinding`、`matchEvent`、`formatBinding`、`findConflicts`、`isReservedBinding`、`serializeKeybindings`、`deserializeKeybindings`。
- `store.ts`：zustand `useKeymapStore`，覆盖表读写 + `localStore` 持久化。
- `hooks.ts`：`useResolvedKeybindings`（默认合并覆盖）与 `useGlobalKeymap`（单一全局监听，按目录顺序派发）。
- `index.ts`：统一出口。

### 3. 命令目录

| 分组 | 命令 | 默认绑定 | 作用域 |
|---|---|---|---|
| 通用 | `commandPalette` | `Ctrl+K` | 全局 |
| 通用 | `toggleAssistant` | `Ctrl+J` | 全局 |
| 通用 | `find` | `Ctrl+F` | 编辑器（有活动章节且未被弹窗占用） |
| 通用 | `globalSearch` | `Ctrl+Shift+F` | 全局 |
| 通用 | `openSettings` | `Ctrl+,` | 全局 |
| 分区导航 | `section1..5` | `Ctrl+1..5` | 工作台 |
| 视图与缩放 | `zoomIn` / `zoomOut` / `zoomReset` | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | 全局 |

`useGlobalKeymap` 只派发提供了处理器且启用的命令；`find` 由编辑器 hook 自行匹配，避免全局层抢键。处理器与启用开关走 ref，仅绑定表变化时重挂监听。

### 4. 绑定串语法

- 形如 `Ctrl+Shift+K`；`Ctrl` 是主修饰键（Windows/Linux 为 Ctrl，mac 为 Cmd）。
- 解析接受别名：`Control`/`Cmd`/`Command`/`Meta`/`Super`/`Win` 归一为主修饰键，`Option` 归一为 `Alt`，`Esc`/`Up` 等归一为规范命名键。
- 规范串修饰键顺序 `Ctrl`、`Shift`、`Alt`，字母键小写存储、单字符大写展示。
- `matchEvent` 要求主修饰键、Shift、Alt 精确匹配，键名归一后相等；mac 上 `Cmd` 与 `Ctrl` 同义。
- 录制要求至少一个主修饰键或 Alt；单独的 Shift+字母与修饰键自身不构成绑定。

### 5. 持久化与冲突策略

- 持久化单出口：`localStore`（键 `STORAGE_KEYS.keybindings`）。只存覆盖项，键位是安装级偏好，不进业务 `AppState`，不随作品同步；空表即全默认。写入前经 `serializeKeybindings` 归一化，读取经 `deserializeKeybindings` 丢弃非法命令与非法绑定。
- 冲突：`findConflicts` 与已解析绑定表比对，与其它命令同串即拒绝保存并提示对方名称。
- 浏览器保留：`isReservedBinding` 复用 `shared/constants/browserShortcuts.ts` 的屏蔽清单，命中即拒绝并提示。带 Alt 的组合不在屏蔽范围。
- 恢复默认：单条 `resetBinding` 与整体 `resetAll` 都清覆盖项。

### 6. 与主进程屏蔽协同

屏蔽清单单源在 `shared/constants/browserShortcuts.ts`：主进程 `isBlockedBrowserShortcut` 据此 `before-input-event` 拦截，渲染层录制据此提示。被拦截的组合不会到达渲染层，故在录制期拒绝而不是保存一条死绑定。应用自定义组合不在屏蔽清单，应用绑定优先。

## 验收

- 打包运行中捏合手势与 `Ctrl/Cmd+滚轮` 不改变缩放；`Ctrl+=`、`Ctrl+-`、`Ctrl+0` 只调整界面字号。
- 默认绑定下 `Ctrl+K`、`Ctrl+J`、`Ctrl+F`、`Ctrl+1..5`、`Ctrl+Shift+F`、`Ctrl+,` 行为与既有实现一致。
- 设置 → 通用 → 快捷键：改键即时生效并持久化，重开应用保留；冲突与保留组合有可读提示且不保存；单条与整体恢复默认可用。
- `shared/keymap` 纯函数单测覆盖解析、匹配、冲突、保留判定与序列化往返。
- 中英字典键集与占位符一致；录制按钮有可读 `aria-label`，提示 `role="alert"`。

## 风险

- Chromium 版本差异影响 `setVisualZoomLevelLimits` 行为；主进程对该调用 catch，渲染层 wheel 拦截作为兜底。
- 开发运行的默认菜单注册缩放加速键；最小菜单在开发与打包都去掉缩放角色，避免两套缩放并存。
- 用户覆盖导致的有效冲突只可能在手工编辑持久化数据时出现；加载期归一化与默认表去重降低影响，冲突在设置页可见。
- 键位不再随作品数据备份/同步，换机需重新配置。属安装级偏好的预期代价。
