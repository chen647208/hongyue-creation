import { defineConfig } from 'vitepress';

/**
 * 文档站：以 docs/{design,guides,features} 为内容源，VitePress 静态输出。
 * 面向两类读者：想用软件的人（使用教程 / 功能说明）与想改代码的人（设计蓝图 / 开发指南）。
 * 导航按这个顺序排，用户视角在前。
 */
export default defineConfig({
  lang: 'zh-CN',
  title: '红月创作 (Hongyue Creation)',
  description: '本地优先的桌面小说创作工具——使用教程、功能说明与设计蓝图',
  base: '/hongyue-creation/',
  srcDir: 'src',
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/hongyue-creation/app-icon.svg' }]],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: '红月创作',
    nav: [
      { text: '使用教程', link: '/guide/', activeMatch: '/guide/' },
      { text: '功能说明', link: '/features/workflow', activeMatch: '/features/' },
      { text: '设计蓝图', link: '/design/README', activeMatch: '/design/' },
      { text: '开发指南', link: '/guides/project-structure', activeMatch: '/guides/' },
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除查询条件',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },
    outline: { level: [2, 3], label: '本页目录' },
    lastUpdated: { text: '最后更新于' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '回到顶部',
    footer: {
      message: '以 AGPL-3.0-only 发布，商业闭源集成另获专有授权。',
      copyright: 'Copyright © 2026 chen647208',
    },
    sidebar: {
      '/guide/': [
        {
          text: '使用教程',
          items: [
            { text: '中文教程', link: '/guide/' },
            { text: 'User Guide (EN)', link: '/guide/en' },
          ],
        },
      ],
      '/features/': [
        {
          text: '功能说明',
          items: [
            { text: '创作主流程', link: '/features/workflow' },
            { text: 'AI 调用层', link: '/features/ai-layer' },
            { text: '写作', link: '/features/writing' },
            { text: '伏笔追踪', link: '/features/foreshadowing' },
            { text: '知识库', link: '/features/knowledge' },
            { text: '助手', link: '/features/assistant' },
            { text: '世界观与一致性', link: '/features/world' },
            { text: '角色', link: '/features/characters' },
            { text: '设置', link: '/features/settings' },
            { text: '插件、同步与加密', link: '/features/plugins-and-sync' },
            { text: '版本', link: '/features/version' },
            { text: '备份与崩溃上报', link: '/features/backup-and-crash' },
            { text: 'UI 组件清单', link: '/features/ui-catalog' },
          ],
        },
      ],
      '/design/': [
        {
          text: '蓝图总纲',
          items: [
            { text: '设计文档索引', link: '/design/README' },
            { text: '01 现状评估', link: '/design/01-current-state' },
            { text: '02 目标架构', link: '/design/02-target-architecture' },
            { text: '03 数据层', link: '/design/03-data-layer' },
            { text: '04 插件系统', link: '/design/04-plugin-system' },
            { text: '05 AI 层', link: '/design/05-ai-layer' },
            { text: '06 编辑器与 UI', link: '/design/06-editor-and-ui' },
            { text: '07 导出构建', link: '/design/07-export-build' },
            { text: '08 路线图', link: '/design/08-roadmap' },
          ],
        },
        {
          text: '深化设计',
          items: [
            { text: '09 Agent 后续项', link: '/design/09-agent-followups' },
            { text: '10 流程与数据欠账', link: '/design/10-flow-and-data-debt' },
            { text: '11 会话记忆与压缩', link: '/design/11-chat-memory' },
            { text: '12 写作管理', link: '/design/12-writing-manage' },
            { text: '13 导出矩阵', link: '/design/13-export-matrix' },
            { text: '14 助手进阶', link: '/design/14-assistant-advanced' },
            { text: '15 系统补齐', link: '/design/15-system-roundup' },
            { text: '16 功能补齐', link: '/design/16-new-features' },
            { text: '17 行业基线补齐', link: '/design/17-industry-gaps' },
            { text: '18 规范化重构', link: '/design/18-standardization' },
            { text: '19 UI 系统机制', link: '/design/19-ui-system' },
            { text: '20 外部项目基准', link: '/design/20-external-benchmark' },
            { text: '21 插件沙箱', link: '/design/21-plugin-sandbox' },
            { text: '22 插件逻辑贡献协议', link: '/design/22-plugin-logic-contributions' },
            { text: '23 数据层存储选型', link: '/design/23-data-layer-storage' },
            { text: '24 本地优先数据层', link: '/design/24-local-first-data-layer' },
          ],
        },
        {
          text: '平台与生态',
          items: [
            { text: '25 数据安全', link: '/design/25-data-safety' },
            { text: '26 成熟度缺口清单', link: '/design/26-maturity-gaps' },
            { text: '27 IPC 信任边界加固', link: '/design/27-ipc-hardening' },
            { text: '28 文档已写、代码未落地清单', link: '/design/28-doc-impl-gaps' },
            { text: '29 通用创作平台', link: '/design/29-general-creation-platform' },
            { text: '30 按需载入正文', link: '/design/30-lazy-node-loading' },
            { text: '31 存储后端切换与哨兵', link: '/design/31-storage-backend-migration' },
            { text: '32 AI 写入治理', link: '/design/32-ai-write-governance' },
            { text: '33 动效规范', link: '/design/33-motion' },
            { text: '34 创作域能力矩阵', link: '/design/34-creation-domain-matrix' },
            { text: '35 跨设备与移动端', link: '/design/35-cross-device-and-mobile' },
            { text: '36 数据同步与冲突', link: '/design/36-data-sync-and-conflict' },
            { text: '37 AI 上下文注入与可信检索', link: '/design/37-ai-context-and-grounding' },
            { text: '38 修订、批注与关联', link: '/design/38-revision-annotation-and-linking' },
            { text: '39 编译与导出', link: '/design/39-compile-and-export' },
            { text: '40 生态与运行时能力', link: '/design/40-ecosystem-and-runtime' },
          ],
        },
        {
          text: '专题深化',
          items: [
            { text: '41 非虚构与引用', link: '/design/41-nonfiction-and-reference' },
            { text: '42 分支叙事与绘本', link: '/design/42-branching-and-picturebook' },
            { text: '43 无障碍与国际化品质', link: '/design/43-accessibility-and-i18n' },
            { text: '44 创作范式地图与跨域能力', link: '/design/44-paradigms-and-cross-domain' },
            { text: '45 查询、块引用与素材隔离', link: '/design/45-query-blocks-and-materials' },
            { text: '46 时间线深化与版本', link: '/design/46-timeline-and-versioning' },
            { text: '47 跨域视图与脚本层', link: '/design/47-cross-domain-views-and-scripting' },
            { text: '48 后续任务总表', link: '/design/48-backlog' },
            { text: '49 可执行插件描述符协议', link: '/design/49-executable-plugin-protocol' },
            { text: '50 键位自定义与缩放接管', link: '/design/50-keybindings-and-zoom' },
          ],
        },
      ],
      '/guides/': [
        {
          text: '开发指南',
          items: [
            { text: '项目结构', link: '/guides/project-structure' },
            { text: '构建与发布', link: '/guides/build-and-release' },
            { text: 'CI 与发布流程', link: '/guides/ci-and-release' },
            { text: '编写插件', link: '/guides/writing-a-plugin' },
            { text: '许可说明', link: '/guides/licensing' },
            { text: '验收报告', link: '/guides/acceptance-report' },
            { text: 'v0 就绪度与验收清单', link: '/guides/v0-readiness' },
          ],
        },
      ],
    },
  },
});
