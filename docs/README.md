# 文档总览

本目录用于记录当前项目的真实结构、功能模块与构建发布方式。
所有文档均以当前代码为准，目标是帮助后续维护时快速定位入口、职责和边界。

面向使用者的教程见仓库根 [USER_GUIDE.md](../USER_GUIDE.md) 与 [USER_GUIDE_EN.md](../USER_GUIDE_EN.md)；
在线文档站见 <https://chen647208.github.io/hongyue-creation/>。

## 文档规范

本项目以实时跟进业界最新实践为常态——代码库没有「迁移完成时」，任何时候
都处于当前形态。由此派生四条硬规则：

1. **只描述现在是什么**。禁止变迁叙事：交代"过去什么样、现在变成什么样"的
   句式一律不写——历史归 git log 与提交信息，读者无法也无需
   区分现状与考古。
2. **里程碑编号不进正文**。M2.3、v1.7 之类是排期产物，不是系统结构；
   结构用模块路径与职责描述。
3. **已知边界用现在时**。尚未支持的能力写成「当前边界：……」，这是现状
   的一部分，不是待办清单。
4. **时点快照单独归档**。验收报告等带证据快照的文档须在标题声明其时点
   性质；design/（前瞻蓝图）与 features/（现状）分工见下。

（依据业界共识：文档描述当前状态，历史叙事归 changelog/commit——
Trail of Bits、Cloudflare coding standards、WordPress 文档风格指南同款规则。）

## 阅读顺序

### 1. 先看整体

- `guides/project-structure.md`：项目分层、主线结构与目录约定
- `guides/build-and-release.md`：构建命令、产物位置与打包说明
- `guides/ci-and-release.md`：CI 持续集成与基于标签的自动发布流程
- `guides/writing-a-plugin.md`：从模板编写插件、贡献点与许可边界
- `guides/licensing.md`：AGPL-3.0 社区版与商业授权的双重许可说明
- `guides/acceptance-report.md`：逐篇设计验收标准的状态与证据（2026-09 时点快照）
- `guides/v0-readiness.md`：v0 就绪度与验收清单（对外发布口径与手工验收步骤）
- `CLA.md`：贡献者许可协议正文

### 2. 再看核心功能

- `features/workflow.md`：从书籍创建到灵感、人物、大纲、章节的主创作流程
- `features/ai-layer.md`：AI 调用层架构（适配器、流式、取消、重试、结构化输出）
- `features/writing.md`：正文写作、AI 历史、编辑快照、统计、导出与专注模式
- `features/foreshadowing.md`：伏笔追踪（埋设/回收/超期、AI 检测、提示词注入）
- `features/knowledge.md`：知识库、向量检索与世界构建中心
- `features/assistant.md`：全局助手、智能推荐与上下文分析
- `features/world.md`：世界观、时间线与一致性检查相关能力
- `features/characters.md`：角色卡编辑、枚举归一化与人物卡导出
- `features/settings.md`：模型、Embedding、提示词和存储设置
- `features/plugins-and-sync.md`：插件系统、同步（冲突副本）、逐条目加密、导出构建管线
- `features/version.md`：版本信息、更新检查与版本历史
- `features/ui-catalog.md`：UI 组件清单与用法（通用交互的唯一来源，配套 `design/19-ui-system.md`）

### 3. 目标设计（design/）

- `design/README.md`：v2 设计索引——起点基线、目标架构、数据层、插件系统、AI 层、编辑器、导出、路线图、外部项目基准
- 注意：design/ 是**前瞻性设计**，描述目标；功能落地后回写进 features/ 对应文档，现状以 features/ 为准

## 当前文档范围

- `features/` 与 `guides/` 只覆盖当前仓库里已经存在并在主线中使用的结构
- `design/` 是目标方案（前瞻蓝图），允许描述未实现内容（以 design/README 的性质声明为准）
- 已移除的兼容层不会再单独保留说明文档
- 如代码继续调整，优先更新本目录和 `README.md`

## 文档维护约定

- 文档默认使用中文
- 文档内容以“真实代码路径 + 职责说明 + 维护建议”为主
- `features/` 与 `guides/` 不写与当前仓库不符的计划性描述（计划见 design/）
- 不把整理日志放回 `docs/plans`
