import DefaultTheme from 'vitepress/theme';
import type { App } from 'vue';

import Home from './Home.vue';
import './style.css';

/** 站点主题：默认主题之上挂首页组件，并覆写品牌色与字体。 */
export default {
  extends: DefaultTheme,
  enhanceApp({ app }: { app: App }) {
    app.component('Home', Home);
  },
};
