# 知识库功能说明

## 适用范围

本文件覆盖知识库、向量检索、世界构建入口与知识条目管理。
对应代码主要位于 `src/renderer/features/knowledge`。

## 核心文件

- `StepKnowledgeEnhanced.tsx`：知识库主编排器（唯一入口）
- `components/KnowledgeSearchBar.tsx` / `KnowledgeSearchResults.tsx`：检索栏与结果卡片
- `components/KnowledgeFeatureEditors.tsx`：地点/势力/规则/时间线/一致性/推荐/图谱编辑器集合；时间线的三种视图共用同一面板的页签
- `components/KnowledgeFeaturePanels.tsx`：世界要素卡（地点/势力/时间线/规则）与视图检查工具条
- `services/vectorIntegrationService.ts`：知识索引与检索接入层
- `services/vectorService.ts`：底层向量搜索能力
- `services/embeddingProvider.ts`：Embedding 提供方（api/local 选择 + 自动降级 + 刷新）
- `services/embeddingService.ts`：Embedding 生成服务
- `services/apiEmbeddingService.ts`：Embedding API 接入服务

## 主要职责

- `StepKnowledgeEnhanced.tsx` 负责知识条目列表、编辑区、搜索编排和多面板接线
- `KnowledgeFeaturePanels.tsx` 分两层：世界要素卡展示数量并打开编辑器，视图与检查工具条打开图谱、一致性、推荐、数据视图与剧本
- 向量相关服务负责知识条目索引、语义检索和混合搜索

## 与其他模块的关系

- 知识库会调用 `settings` 中的 Embedding 配置
- 会复用 `world`、`timeline`、`consistency` 与 `assistant` 的相关面板和能力
- 检索与索引结果会反馈到写作和助手功能中使用

## 维护建议

- 世界构建入口优先接到 `KnowledgeFeaturePanels.tsx`
- 向量索引、Embedding 与搜索实现继续集中在 `services`
- 知识库面板的展示逻辑拆在 `components/` 子组件，主编排器只保留状态与接线
