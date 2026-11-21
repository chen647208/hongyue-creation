<script setup lang="ts">
import { withBase } from 'vitepress';

interface Capability {
  title: string;
  body: string;
}

const capabilities: Capability[] = [
  {
    title: '大纲与章节',
    body: '卷、章、场景卡与正文放在同一处，切换时不丢位置。',
  },
  {
    title: '人物与世界观',
    body: '角色卡、关系与时间线集中存放，写到哪就查到哪。',
  },
  {
    title: '伏笔与回收',
    body: '记下埋设位置，回收时提醒，长篇写到后面也不漏线。',
  },
  {
    title: '写作与导出',
    body: '专注模式、编辑快照回滚，TXT、Markdown、DOCX 导出。',
  },
];

const entries = [
  { title: '使用教程', detail: '安装、建书、写到导出', href: '/guide/' },
  { title: '功能说明', detail: '每个功能做什么、在哪里', href: '/features/workflow' },
  { title: '开发指南', detail: '目录结构、构建发布、编写插件', href: '/guides/project-structure' },
];
</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero__copy">
        <h1 class="hero__title">把小说写完。</h1>
        <p class="hero__lede">
          大纲、人物、伏笔、章节在同一个窗口里。稿件保存在本机，不配置 AI 模型也能写。
        </p>
        <div class="hero__actions">
          <a
            class="action action--primary"
            href="https://github.com/chen647208/hongyue-creation/releases/latest"
          >
            下载安装
          </a>
          <a class="action" :href="withBase('/guide/')">阅读使用教程</a>
        </div>
      </div>
      <div class="hero__mark" aria-hidden="true">
        <img src="/logo.svg" alt="" width="300" height="300" />
      </div>
    </section>

    <section class="section section--inside">
      <h2 class="section__title">软件里有什么</h2>
      <div class="capabilities">
        <article v-for="item in capabilities" :key="item.title" class="capability">
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
        </article>
      </div>
    </section>

    <section class="section section--start">
      <h2 class="section__title">从这里开始</h2>
      <ul class="entries">
        <li v-for="entry in entries" :key="entry.title">
          <a :href="withBase(entry.href)">
            <strong>{{ entry.title }}</strong>
            <span>{{ entry.detail }}</span>
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.home {
  --home-ink: #100d13;
  --home-paper: #f7f4ed;
  --home-red: #d0345a;
  --home-gold: #c79a5b;
  --home-muted: #a89ca4;
  --home-text: #f2ece4;
  --home-serif: 'Source Han Serif SC', 'Noto Serif CJK SC', 'Songti SC', 'STSong', 'SimSun',
    serif;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px 96px;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(220px, 0.85fr);
  align-items: center;
  gap: 48px;
  margin: 24px 0 0;
  padding: 72px 56px 72px;
  border-radius: 4px;
  background: var(--home-ink);
  color: var(--home-text);
}

.hero__title {
  margin: 0;
  font-family: var(--home-serif);
  font-size: clamp(44px, 6.4vw, 76px);
  font-weight: 600;
  line-height: 1.18;
  letter-spacing: 0.01em;
}

.hero__lede {
  max-width: 30em;
  margin: 28px 0 0;
  font-size: 16px;
  line-height: 1.9;
  color: var(--home-muted);
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 40px;
}

.action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 22px;
  border: 1px solid rgba(242, 236, 228, 0.28);
  border-radius: 2px;
  color: var(--home-text);
  font-size: 15px;
  text-decoration: none;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.action:hover {
  border-color: var(--home-text);
}

.action--primary {
  border-color: var(--home-red);
  background: var(--home-red);
  color: #fff;
}

.action--primary:hover {
  background: #b82449;
  border-color: #b82449;
}

.hero__mark {
  display: flex;
  justify-content: center;
}

.hero__mark img {
  width: min(300px, 100%);
  height: auto;
}

.section {
  margin-top: 88px;
}

.section__title {
  margin: 0 0 32px;
  font-family: var(--home-serif);
  font-size: 28px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.capabilities {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 64px;
}

.capability {
  padding: 24px 0 28px;
  border-top: 1px solid var(--vp-c-divider);
}

.capability h3 {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.capability p {
  margin: 0;
  font-size: 15px;
  line-height: 1.85;
  color: var(--vp-c-text-2);
}

.entries {
  margin: 0;
  padding: 0;
  list-style: none;
}

.entries li {
  border-top: 1px solid var(--vp-c-divider);
}

.entries li:last-child {
  border-bottom: 1px solid var(--vp-c-divider);
}

.entries a {
  display: grid;
  grid-template-columns: 9em minmax(0, 1fr);
  gap: 24px;
  align-items: baseline;
  padding: 20px 4px;
  color: inherit;
  text-decoration: none;
  transition: background-color 0.2s ease;
}

.entries a:hover {
  background: var(--vp-c-bg-soft);
}

.entries strong {
  font-size: 16px;
  font-weight: 600;
  color: var(--home-red);
}

.entries span {
  font-size: 15px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

@media (max-width: 860px) {
  .hero {
    grid-template-columns: 1fr;
    gap: 32px;
    padding: 56px 32px;
  }

  .hero__mark {
    order: -1;
    justify-content: flex-start;
  }

  .hero__mark img {
    width: 120px;
  }

  .hero__title {
    font-size: clamp(38px, 10vw, 56px);
  }

  .capabilities {
    grid-template-columns: 1fr;
    column-gap: 0;
  }

  .entries a {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .action,
  .entries a {
    transition: none;
  }
}
</style>
