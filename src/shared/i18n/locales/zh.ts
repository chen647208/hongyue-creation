/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 中文字典：按命名空间聚合。主进程经 resources.ts 静态取用，渲染端经 bundle.ts 按语言动态加载。 */
import zhApp from './zh/app.json' with { type: 'json' };
import zhAssistant from './zh/assistant.json' with { type: 'json' };
import zhBooks from './zh/books.json' with { type: 'json' };
import zhCards from './zh/cards.json' with { type: 'json' };
import zhCharacters from './zh/characters.json' with { type: 'json' };
import zhCommon from './zh/common.json' with { type: 'json' };
import zhConsistency from './zh/consistency.json' with { type: 'json' };
import zhErrors from './zh/errors.json' with { type: 'json' };
import zhForeshadow from './zh/foreshadow.json' with { type: 'json' };
import zhKnowledge from './zh/knowledge.json' with { type: 'json' };
import zhNav from './zh/nav.json' with { type: 'json' };
import zhOnboarding from './zh/onboarding.json' with { type: 'json' };
import zhPrompts from './zh/prompts.json' with { type: 'json' };
import zhProviders from './zh/providers.json' with { type: 'json' };
import zhSettings from './zh/settings.json' with { type: 'json' };
import zhSteps from './zh/steps.json' with { type: 'json' };
import zhTimeline from './zh/timeline.json' with { type: 'json' };
import zhVersion from './zh/version.json' with { type: 'json' };
import zhWorld from './zh/world.json' with { type: 'json' };
import zhWriting from './zh/writing.json' with { type: 'json' };

export default {
  app: zhApp,
  assistant: zhAssistant,
  books: zhBooks,
  cards: zhCards,
  characters: zhCharacters,
  common: zhCommon,
  consistency: zhConsistency,
  errors: zhErrors,
  foreshadow: zhForeshadow,
  knowledge: zhKnowledge,
  nav: zhNav,
  onboarding: zhOnboarding,
  prompts: zhPrompts,
  providers: zhProviders,
  settings: zhSettings,
  steps: zhSteps,
  timeline: zhTimeline,
  version: zhVersion,
  world: zhWorld,
  writing: zhWriting,
} as const;
