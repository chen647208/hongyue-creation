import { defineConfig } from 'vitepress';

/**
 * 文档站：以 docs/{guides,features} 为内容源，VitePress 静态输出。
 * 公开站点只放使用教程、功能说明与开发指南；设计蓝图与归档留在仓库，
 * 不进站点（srcExclude 兜底，同步脚本也不再拷贝）。
 */
export default defineConfig({
  lang: 'zh-CN',
  title: '红月创作',
  description: '桌面小说写作软件：大纲、人物、伏笔、章节与正文，稿件保存在本机。',
  base: '/hongyue-creation/',
  srcDir: 'src',
  srcExclude: ['design/**', 'archive/**'],
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/hongyue-creation/app-icon.svg' }]],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: '红月创作',
    nav: [
      { text: '使用教程', link: '/guide/', activeMatch: '/guide/' },
      { text: '功能说明', link: '/features/workflow', activeMatch: '/features/' },
      { text: '开发指南', link: '/guides/project-structure', activeMatch: '/guides/' },
      {
        text: '下载',
        link: 'https://github.com/chen647208/hongyue-creation/releases/latest',
      },
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
      '/guides/': [
        {
          text: '开发指南',
          items: [
            { text: '项目结构', link: '/guides/project-structure' },
            { text: '构建与发布', link: '/guides/build-and-release' },
            { text: 'CI 与发布流程', link: '/guides/ci-and-release' },
            { text: '编写插件', link: '/guides/writing-a-plugin' },
            { text: '许可说明', link: '/guides/licensing' },
            { text: 'v0 就绪度与验收清单', link: '/guides/v0-readiness' },
          ],
        },
      ],
    },
  },
});
