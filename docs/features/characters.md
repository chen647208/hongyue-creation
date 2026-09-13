# 角色功能说明

## 适用范围

本文件覆盖角色卡编辑、枚举归一化与人物卡导出。对应代码位于
`src/renderer/features/characters`。

## 核心文件

- `StepCharacters.tsx`：角色步骤编排
- `CharacterModal.tsx`：角色编辑弹窗（含「导出人物卡」）
- `CompactCharacterCard.tsx`：角色卡紧凑展示
- `RelationshipDiagram.tsx`：人物关系图谱
- `characterKinds.ts`：角色定位/性别/时间线重要度枚举归一化
- `displayLabels.ts`：枚举 → 界面语言的显示名
- `characterCard.ts`：人物卡 Markdown 构建与导出（纯构建 + 另存为）

## 主要职责

- 角色编辑：姓名/性别/年龄/定位/外观/性格/背景/动机/能力/弱点/成长弧线/关系
- 存储只用英文枚举 id（`protagonist` 等），显示层经 `displayLabels` 译出
- 入库时 `normalizeProjectKinds` 幂等归一化老数据的中文枚举值

## 人物卡导出

- 编辑弹窗「导出人物卡」把当前角色导出为 Markdown：标题 + 书名 + 非空字段，
  空字段不落；标签随界面语言。
- 桌面端经 `saveFileDialog` 另存为 `.md`；网页端回退浏览器下载。

## 与其他模块的关系

- 角色被写作/助手/一致性模块引用；关系图谱复用角色关系字段
- 人物卡导出与全书导出是两条独立路径（前者单卡 Markdown，后者整书多格式）
- 随机取名：编辑角色时可一键生成姓名（离线姓+名库，`features/characters/services/nameGeneratorService.ts`），按性别取字
