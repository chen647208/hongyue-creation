# 写作功能说明

## 适用范围

本文件覆盖正文写作、章节编辑、AI 生成、历史记录与导出相关能力。
对应代码位于 `src/renderer/features/writing`。

## 核心文件

- `WritingEditor.tsx`：写作主编排器
- `AIHistoryViewer.tsx`：AI 历史记录查看器
- `components/`：写作域子组件目录
- `components/history/AIHistoryRecordList.tsx`：历史记录列表展示
- `components/WritingEditorToolbar.tsx`：工具条（撤销/重做、查找、章节拆分/合并、专注/打字机等）
- `components/ChapterNavigationSection.tsx`：章节列表与多选批量
- `components/FindBar.tsx`：章内查找替换
- `app/app-shell/GlobalSearchModal.tsx`（书籍库侧）：跨书全文检索
- `services/summaryExtractionService.ts`：摘要提取服务
- `utils.ts`：写作域通用工具
- `types.ts`：写作域本地类型
- `constants.ts`：写作域常量

## 主要职责

- `WritingEditor.tsx` 负责状态编排、AI 生成入口和子组件接线
- `WritingEditorOverlayLayer.tsx` 负责生成弹窗、编辑弹窗、导出弹窗、选区菜单和历史侧层
- `WritingSidebar.tsx` 负责章节导航、摘要区域和辅助信息展示
- `WritingEditorCanvas.tsx` 负责正文输入区与状态遮罩
- `AIHistoryViewer.tsx` 与 `AIHistoryRecordList.tsx` 负责历史记录筛选、排序、展示与操作

## 章节拆分与合并

- 拆分（工具条剪刀）：按当前光标把本章正文切成两段，后段成为紧随其后的新章并切换过去；
  光标在文首/文尾或空章时提示不可拆（`TipTapCanvas` 的 `splitAtCursor` 走 PM `doc.cut`，
  段落中点拆分会保留两侧文本）。
- 合并（工具条合并）：把下一章正文并入本章并删除该章，正文全程保留、不漏字；
  仅当存在下一章时可用。

## 全文检索（跨书）

- 书籍库顶部「全文检索」打开 `GlobalSearchModal`：跨全部书籍的章节正文与知识库检索，
  命中显示书名/章节名与高亮片段，点击直接打开对应书与章节。
- 检索走 `repository.search`（SQLite 为 FTS5，JSON 后端为子串扫描）；
  trigram 分词器下限 3 字，少于 3 字 SQLite 后端无结果。

## 导出与成稿字数

- 导出统一走 `src/core/build` 三段式管线（选择→变换→渲染）：
  `utils.ts` 的 `buildExportContent` 是管线适配器，txt/md/html 三格式
  由渲染器注册表产出（渲染器与变换器均为插件贡献点）。
- 导出弹窗内置「预览」：md 渲染 / html iframe / txt 等宽面板 + 成稿字数。
- 统计面板的 `builtCharCount` 与导出同源（`runBuild` 单一口径）。
- Profile 支持 JSON/YAML 双序列化（`serializeProfileYaml`/`parseProfileYaml`），
  `.yml` 可 diff 可分享。
- 封面导出：书架卡片菜单「导出封面」由 `core/build/cover.ts` 生成竖版 SVG，
  经 `shared/services/coverService.ts` 光栅化为 PNG 另存；环境无 canvas 时退回 SVG。

## 无可用模型时的行为

- 可用口径统一为 `isModelUsable`（已启用且已配好凭证）：默认模型未填 Key
  也视为不可用，与全屏手写豁免拦截同标准。
- 生成/改写/批量/摘要四入口先拦截并提示；生成弹窗与改写弹窗的执行按钮、
  选区润色按钮、摘要提取按钮同步禁用（悬停显示原因）。手写与进编辑器不受影响。

## 与其他模块的关系

- 写作过程会读取主流程生成的章节、人物、知识条目和提示词
- AI 调用经网关客户端（`src/renderer/shared/services/ai/gatewayClient`）走主进程网关
- 历史记录（含会话事件流浏览器）与正文内容经双 store + `persistenceBridge` 差分落盘持久化

## 写作实体面板

- 位置：写作区左侧栏顶部，组件为 `src/renderer/features/writing/components/WritingEntityPanel.tsx`，逻辑在 `services/writingEntityService.ts`。
- 汇总：角色、地点、势力、知识、事件五类实体，带类型图标、搜索与类型筛选。
- 本章出现：命中当前章节正文的实体显示标记（`findMentionedEntities` 按名字匹配）。
- 插入：点击实体把名称插入正文光标处（`NovelEditorHandle.insertText`）。

## 写作工具

- 入口：编辑器工具栏「写作工具」按钮，面板为 `src/renderer/features/writing/components/WritingToolsPanel.tsx`，四个页签。
- 一键排版：`services/writingToolsService.ts` 的 `autoFormatContent` 规范省略号与破折号、合并空行、去行尾空格，可选段落首行缩进；作用于当前章或全书。
- 自动纠错：`findProofreadIssues` 按规则检出常见错别字与重复标点，`applyProofreadFixes` 从后向前一次替换。
- 快捷词：`services/snippetStore.ts` 用 `localStore` 持久化片段，面板可增删与插入到光标处（`NovelEditorHandle.insertText`）。
- 多平台预览：`components/ReaderPreview.tsx` 用编译产出的 HTML 在桌面/平板/手机宽度下渲染当前章节。
- 画布宽度：窄视口（如侧栏与助手同时打开）下正文画布保持 320px 最小宽度并横向滚动，不塌缩为零宽。
- 自动滚屏：打字机模式按最近的滚动祖先容器把光标定位到视口约 40% 高度。

## 结构页：计划与分组

- 入口：结构分区子页签「计划」「分组/卷」。
- 计划（`features/plan/`）：五阶段看板——选题 / 大纲 / 章节 / 修订 / 校验；条目可勾选完成、改阶段、删除，随作品落 `Project.plan`（`docs/design/20` 的计划/待办落地）。
- 分组（`features/groups/`）：自由命名分组（卷/幕/单元均可，不预设「卷」语义），章节经 `Chapter.groupId` 归属；`Project.groups` 存定义。分组只影响组织与时间线聚合，不改正文；时间线合并使用同一 `Chapter.groupId`。

## 定稿锁定
- 章节 `status` 取值 `draft | writing | done | final`。
- 工具栏锁按钮在 `final` 与 `draft` 间切换；`status` 为 `final` 时正文只读，AI 生成同样不改写。

## 维护建议

- 新增弹窗、局部面板或历史展示能力时优先放入 `components`
- 通用逻辑优先放入 `services`、`utils.ts` 或 `types.ts`
- `WritingEditor.tsx` 保持编排器定位：新增能力下沉子组件与 services，
  入口守卫就近收敛，不在编排器里堆分支
