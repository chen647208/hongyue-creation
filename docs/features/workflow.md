# 创作主流程说明

## 适用范围

本文件覆盖从书籍创建到灵感生成、人物构建、大纲整理和章节规划的主流程。
对应代码主要分布在以下目录：

- `src/renderer/features/books`
- `src/renderer/features/inspiration`
- `src/renderer/features/characters`
- `src/renderer/features/outline`
- `src/renderer/features/chapters`
- `src/renderer/app`

## 主流程入口

- `src/renderer/app/App.tsx`：装配层（书籍动作、引导、路由、设置宿主），状态收敛到双 store
- `src/renderer/app/app-shell/WorkspaceNav.tsx`：工作台左侧导航（可见性单源在 `sectionFeatures.ts`，导航只消费）、步骤切换与完成状态点
- `src/renderer/app/app-shell/Bookshelf.tsx`：书籍库（列表/搜索/新建/导入），卡片点进工作台
- `src/renderer/features/books/NewBookModal.tsx`：新建、复制模板等创建方式

## 流程分段

### 1. 书籍管理

- `Bookshelf.tsx`：书籍列表展示、切换当前项目、触发新建/导入入口
- 批量管理：进入多选后可全选/清除，批量删除（一次确认，逐本进回收站）与批量打标（合并标签）
- `NewBookModal.tsx`：新建、复制模板等创建方式

### 2. 灵感生成

- `StepInspiration.tsx`：输入灵感、选择提示词、调用 AI 生成书名与简介
- 当前步骤也承接世界观起始信息的录入与预览

### 3. 人物构建

- `StepCharacters.tsx`：人物生成、人物列表与人物编辑调度
- `CharacterModal.tsx`：单个人物的详细编辑
- `CompactCharacterCard.tsx`：人物卡片展示
- `RelationshipDiagram.tsx`：人物关系图展示

### 4. 大纲整理

- `StepOutline.tsx`：根据简介与人物设定生成和整理大纲

### 5. 章节规划

- `StepChapterOutline.tsx`：生成章节细纲、维护章节列表与章节概要；细纲生成带人物与书名简介上下文，全量生成按 order 合并（既有正文与历史原位保留）

## 跨页接力

- 结构页默认落大纲子页；顶栏引导胶囊深链到缺失的一段（缺大纲进大纲，否则进细纲）
- 章节卡“写本章”进写作；写作空章自动选中第一章，无章时画布提供新建首章与回结构入口
- 人物生成缺简介时弹提示回灵感页补充，不再静默跳过

## 数据流说明

- 当前项目主状态由双 store 持有（`app/stores/projectStore.ts` + `settingsStore.ts`）
- 启动按骨架载入：`loadAll` 只取书库骨架（非活动书 `hydrated:false`，正文留空并带字数缓存），随后补载活动书正文；打开其它书时经 `loadBookContent` 补载。导出、自动/手动备份、复制书在动手前先补载全部正文，避免落出空书
- 派生索引按需重建：冷启动只重建活动书索引，其余书在打开时重建
- 各步骤组件通过 `project` 和 `onUpdate` 接收数据与回写修改
- 书籍切换、本地持久化和初始化加载由 `persistenceBridge.ts` 差分落盘配合完成

## 维护建议

- 主流程步骤组件继续保持“单步骤单入口”结构
- 跨步骤复用逻辑优先抽到对应功能域的 `services`
- 流程组件归属各自功能域的目录，不放进 `components` 根目录
