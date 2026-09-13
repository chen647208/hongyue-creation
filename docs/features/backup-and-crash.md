# 备份与崩溃上报

## 自动备份

- JSON 快照：`shared/services/autoBackupService.ts` 写入 `<storagePath>/backups/novalist-backup-<ISO>.json`；库级加密开启时改落 `.json.enc`。
- 数据库热备份：主进程 `VACUUM INTO` 生成 `<userData>/backups/hongyue-db-<ISO>.db`（含 WAL 未 checkpoint 数据），按份数滚动保留。
- 触发：`app/stores/persistenceBridge.ts` 在每次落盘后按间隔判定，另有周期任务兜底。

## 恢复

- JSON 快照：存储设置面板列出历史，预览后按书选择恢复（`BackupRestoreDialog`）。
- 数据库热备份：存储设置面板列出 `.db` 备份，可「校验」（只读 `quick_check`）与「恢复」；恢复前自动热备份当前库，恢复后需重启应用加载。

## 崩溃上报

- `crashReporter` 默认只在本机留存转储；用户开启且配置了上报地址才上传，配置见 `main/app/crashReportConfig.ts`。
- 本地崩溃记录保留最近若干条，用于设置面板与日志排查。

## 边界

- 桌面端禁用自定义库路径：数据库不迁移，该路径只影响备份与 JSON 回退存储。
