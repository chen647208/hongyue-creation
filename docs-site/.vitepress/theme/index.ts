import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';

import DesignBanner from './DesignBanner.vue';
import './style.css';

/**
 * 在默认主题之上补两处：
 * - /design/ 每页顶部挂「前瞻蓝图」横幅：该目录描述目标而非现状，避免读者当成当前功能。
 * - 侧边栏分组标题略作收窄，长中文标题在窄视口下更少折行。
 */
export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-before': () => h(DesignBanner),
    });
  },
};
