/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 英文字典：按命名空间聚合。主进程经 resources.ts 静态取用，渲染端经 bundle.ts 按语言动态加载。 */
import enApp from './en/app.json' with { type: 'json' };
import enAssistant from './en/assistant.json' with { type: 'json' };
import enBooks from './en/books.json' with { type: 'json' };
import enCards from './en/cards.json' with { type: 'json' };
import enCharacters from './en/characters.json' with { type: 'json' };
import enCommon from './en/common.json' with { type: 'json' };
import enConsistency from './en/consistency.json' with { type: 'json' };
import enErrors from './en/errors.json' with { type: 'json' };
import enForeshadow from './en/foreshadow.json' with { type: 'json' };
import enKnowledge from './en/knowledge.json' with { type: 'json' };
import enNav from './en/nav.json' with { type: 'json' };
import enOnboarding from './en/onboarding.json' with { type: 'json' };
import enPrompts from './en/prompts.json' with { type: 'json' };
import enProviders from './en/providers.json' with { type: 'json' };
import enSettings from './en/settings.json' with { type: 'json' };
import enSteps from './en/steps.json' with { type: 'json' };
import enTimeline from './en/timeline.json' with { type: 'json' };
import enVersion from './en/version.json' with { type: 'json' };
import enWorld from './en/world.json' with { type: 'json' };
import enWriting from './en/writing.json' with { type: 'json' };

export default {
  app: enApp,
  assistant: enAssistant,
  books: enBooks,
  cards: enCards,
  characters: enCharacters,
  common: enCommon,
  consistency: enConsistency,
  errors: enErrors,
  foreshadow: enForeshadow,
  knowledge: enKnowledge,
  nav: enNav,
  onboarding: enOnboarding,
  prompts: enPrompts,
  providers: enProviders,
  settings: enSettings,
  steps: enSteps,
  timeline: enTimeline,
  version: enVersion,
  world: enWorld,
  writing: enWriting,
} as const;
