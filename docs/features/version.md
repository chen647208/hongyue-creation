# 版本功能说明

## 适用范围

本文件覆盖版本信息展示、更新检查与版本历史展示。
对应代码位于 `src/renderer/features/version`。

## 核心文件

- `VersionCheckModal.tsx`：版本检查弹窗（原生更新时显示下载进度与「重启并安装」）
- `services/versionService.ts`：版本读取、比较、GitHub Release 检查与版本历史服务
- `services/updateService.ts`：打包版原生更新桥（经 preload 的 `updater` 调主进程）
- `src/main/updater.ts`：主进程 electron-updater 接入（检查/下载/安装 + 状态事件）
- `src/renderer/env.d.ts`：前端构建常量声明
- `vite.config.ts`：注入前端可用的 `__APP_VERSION__`

## 当前实现方式

- 当前版本号来源于 `package.json` 中的 `version`
- 构建时由 `vite.config.ts` 读取版本号并注入 `__APP_VERSION__`
- 渲染层不再通过 Node 的 `module` 或 `createRequire` 读取 `package.json`
- 更新检查分两条路径：
  - 打包版桌面端：`updater`（electron-updater）原生检查 → 用户点「下载并安装更新」→ 退出时安装；
    元数据来自 electron-builder 的 github publish 生成的 `latest*.yml`
  - 开发/网页预览：GitHub Releases 的 latest 接口查询（无原生更新能力，只给版本提示）

## 当前职责

- `checkForUpdates()`：请求最新 Release 信息并判断是否有新版本（开发/网页预览路径）
- `nativeCheckForUpdate()` / `nativeDownloadUpdate()` / `nativeInstallUpdate()` / `onUpdaterStatus()`：打包版原生更新链路
- `compareVersions()`：比较语义化版本号
- `getCurrentVersionInfo()`：返回当前本地版本信息
- `getVersionHistory()`：返回内置版本历史
- `formatVersion()`：统一版本号显示格式

## 已知边界

- 开发版不注册原生更新（无 `app-update.yml`），不会真实下载安装
- 代码签名/公证按仓库 Secrets 配置自动生效；未配置证书时产物未签名，Windows/macOS 安装时的系统安全提示属预期（见 `docs/guides/ci-and-release.md`）
