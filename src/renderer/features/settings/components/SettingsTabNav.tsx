/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import { Brain, Cpu, Database, GraduationCap, type LucideIcon,SlidersHorizontal, Stethoscope, Terminal, WandSparkles } from 'lucide-react';
import React, { useSyncExternalStore } from 'react';

import { useTranslation } from '@/i18n';
import { cn } from '@/shared/utils/cn';

import { settingsTabRegistry } from '../services/settingsTabs';
import type { SettingsTab } from '../types';

interface SettingsTabNavProps {
  activeTab: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}

type LabelKey = 'tab.general' | 'tab.models' | 'tab.prompts' | 'tab.cardPrompts' | 'tab.consistencyPrompts' | 'tab.system' | 'tab.storage' | 'tab.embedding' | 'tab.plugins';

interface TabItem {
  id: SettingsTab;
  icon: LucideIcon;
  labelKey: LabelKey;
}

interface TabGroup {
  id: string;
  labelKey: string;
  fallback: string;
  items: TabItem[];
}

const TAB_GROUPS: TabGroup[] = [
  {
    id: 'basic', labelKey: 'tabGroup.basic', fallback: '常规',
    items: [
      { id: 'general', icon: SlidersHorizontal, labelKey: 'tab.general' },
      { id: 'storage', icon: Database, labelKey: 'tab.storage' },
    ],
  },
  {
    id: 'ai', labelKey: 'tabGroup.ai', fallback: 'AI 模型',
    items: [
      { id: 'models', icon: Cpu, labelKey: 'tab.models' },
      { id: 'embedding', icon: Brain, labelKey: 'tab.embedding' },
    ],
  },
  {
    id: 'prompts', labelKey: 'tabGroup.prompts', fallback: '提示词',
    items: [
      { id: 'prompts', icon: Terminal, labelKey: 'tab.prompts' },
      { id: 'card-prompts', icon: WandSparkles, labelKey: 'tab.cardPrompts' },
      { id: 'consistency-prompts', icon: Stethoscope, labelKey: 'tab.consistencyPrompts' },
    ],
  },
  {
    id: 'system', labelKey: 'tabGroup.system', fallback: '系统',
    items: [
      { id: 'system', icon: GraduationCap, labelKey: 'tab.system' },
    ],
  },
];

/**
 * 设置导航：桌面为左侧分组纵向列表，窄屏回落为顶部横向换行。
 * 内置页签与插件页签同源：插件注册的分组键命中已有分组时并入该组，未声明分组才进「扩展」。
 */
const SettingsTabNav: React.FC<SettingsTabNavProps> = ({ activeTab, onChange }) => {
  const { t } = useTranslation('settings');
  const registered = useSyncExternalStore(
    (cb) => settingsTabRegistry.subscribe(cb),
    () => settingsTabRegistry.list(),
  );

  const asItem = (tab: (typeof registered)[number]): TabItem => ({
    id: tab.id,
    icon: tab.icon as LucideIcon,
    labelKey: tab.labelKey as LabelKey,
  });
  const groups: TabGroup[] = TAB_GROUPS.map((group) => ({
    ...group,
    items: [
      ...group.items,
      ...registered.filter((tab) => tab.groupLabelKey === group.labelKey).map(asItem),
    ],
  }));
  const ungrouped = registered.filter((tab) => !tab.groupLabelKey);
  if (ungrouped.length > 0) {
    groups.push({ id: 'extensions', labelKey: 'tabGroup.extensions', fallback: '扩展', items: ungrouped.map(asItem) });
  }

  return (
    <nav
      aria-label={t('tabNavLabel')}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 xl:w-52 xl:shrink-0 xl:flex-col xl:flex-nowrap xl:items-stretch xl:gap-4 xl:overflow-y-auto xl:border-b-0 xl:border-r xl:px-3 xl:py-4"
    >
      {groups.map((group) => (
        <div key={group.id} className="flex flex-wrap items-center gap-1 xl:flex-col xl:items-stretch xl:gap-0.5">
          <span className="px-1 text-2xs font-medium text-muted-foreground xl:mb-1 xl:px-2 xl:text-xs">
            {t(group.labelKey, group.fallback)}
          </span>
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-pressed={activeTab === item.id}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors xl:w-full',
                activeTab === item.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <item.icon className="size-3.5 shrink-0" />
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
};

export default SettingsTabNav;
