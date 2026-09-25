# 31 存储后端切换与哨兵（OPFS ↔ localStorage）

## 背景与问题

`shared/services/repository/index.ts` 按环境选后端：桌面/IPC → SQLite(opfs) → 无 OPFS 时回退 localStorage。回退只 `logger.warn`，无哨兵、无迁移、无提示：在“上次用 OPFS、这次 OPFS 不可用”时，用户看到的是**空书库**（localStorage 里没有数据），造成“丢书”错觉。审计项见 `docs/archive/26-maturity-gaps.md` 第 4 节。

## 目标

- 记录**上次使用的后端**为哨兵，启动时检测不一致并显式告知，绝不静默换库。
- localStorage → OPFS 的单向一次性迁移（OPFS 可用且 localStorage 有数据、OPFS 为空时）。
- 反方向（OPFS → localStorage）**不自动迁移**，只提示并提供导出/重试入口。

## 非目标

- 不做云同步；不做跨设备迁移。
- 不加密 localStorage 回退数据。

## 设计

1. 哨兵：localStorage 键 `storage.backend` ∈ `{ 'sqlite-opfs' | 'json-local' }`；每次成功初始化后写入当前后端。
2. 启动流程：
   - 期望后端 = 哨兵值（无哨兵视为按环境自动选择）。
   - 期望 `sqlite-opfs` 但 OPFS 不可用 → **不启动应用主界面**，弹阻断提示：说明数据仍在原后端、给“重试 / 用回退模式打开（只读）/ 导出备份”入口。
   - 期望 `json-local` 且 OPFS 现在可用 → 询问是否迁移（默认不自动）。
3. 迁移（local → opfs）：
   - 读取 localStorage 全量 → 写入 OPFS 库 → 校验（书数/章节数一致）→ 写哨兵 → 备份并清空 localStorage 键（保留 `.legacy` 副本到用户数据目录）。
   - 任一步失败即中止，保留原数据，哨兵不变。
4. 提示统一走 `dialogService`，可访问且可键盘操作。

## 验收

- 模拟“哨兵=OPFS、OPFS 不可用”时启动：不显示空书库，显示阻断提示与重试/导出。
- localStorage→OPFS 迁移后：书库一致，localStorage 键清理，哨兵更新；失败路径数据不丢。
- 单测覆盖：哨兵判定、迁移成功/失败、回退只读分支。

## 风险

- 迁移中途崩溃：以“先写新库并校验，后清旧库”的顺序把损坏窗口降到最小。
- 浏览器隐私模式配额：迁移前先探测可写性。
