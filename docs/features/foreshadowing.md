# 伏笔追踪

伏笔追踪帮助作者在长篇写作中管理「埋设—回收」的线索，避免伏笔被遗忘，并在生成正文时自动提醒模型承接未回收伏笔。

## 数据模型

`src/shared/types.ts` 中的 `Foreshadow`，挂在 `Project.foreshadows` 上：

- `title` / `detail`：伏笔简述与具体内容
- `status`：`planted`（未回收）/ `paid-off`（已回收）/ `abandoned`（已废弃）
- `importance`：`minor` / `major` / `critical`
- `plantedChapterId` / `plantedChapterOrder`：埋设章节
- `payoffChapterId` / `payoffChapterOrder`：回收章节
- `tags`：关联人物/地点/线索标签

## 服务

`src/renderer/shared/services/foreshadowService.ts`（纯函数 + AI 检测）：

- 增删改：`createForeshadow` / `addForeshadow` / `updateForeshadow` / `removeForeshadow` / `setStatus` / `payOffForeshadow`
- 查询：`openForeshadows`（按重要度与埋设顺序排序）、`overdueForeshadows`（跨度超阈值仍未回收）、`foreshadowCounts`
- RAG 注入：`buildForeshadowContextForPrompt(project, upToOrder)` 生成「待回收伏笔」提示块
- AI 检测：`detectPaidOffForeshadows(model, project, chapter)` 用 `AIService.callJSON` 扫描章节正文，返回被回收的伏笔 id

## 与写作流程的集成

- 章节生成时（`WritingEditor` 的单章与批量两条路径），会把截至本章仍未回收的伏笔注入提示词，提醒模型自然承接。
- 工具栏「伏笔」按钮打开管理面板（`ForeshadowPanel`），支持新增、按未回收/全部过滤、标记回收、废弃、删除，以及「AI 检测本章回收」一键扫描当前章节正文并自动标记。
- 存在超期未回收伏笔时，工具栏按钮以红色计数提醒。
- 「AI 检测本章回收」要求可用模型（`isModelUsable`）：未配置时按钮禁用，
  入口拦截并提示；手动新增、标记、废弃、删除不受影响。

## 测试

`foreshadowService` 的纯函数（排序、超期、计数、提示注入等）在 `src/renderer/shared/services/__tests__/foreshadowService.test.ts` 覆盖。
