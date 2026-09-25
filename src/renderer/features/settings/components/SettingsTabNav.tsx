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

interface TabGroup {
  id: string;
  labelKey: string;
  fallback: string;
  items: Array<{ id: SettingsTab; icon: LucideIcon; labelKey: LabelKey }>;
}

/** 9 tab 平铺改为 3 组：AI 模型 / 提示词 / 系统。数据不动，只改导航分组，降低认知负荷。 */
const TAB_GROUPS: TabGroup[] = [
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
      { id: 'general', icon: SlidersHorizontal, labelKey: 'tab.general' },
      { id: 'system', icon: GraduationCap, labelKey: 'tab.system' },
      { id: 'storage', icon: Database, labelKey: 'tab.storage' },
    ],
  },
];

const SettingsTabNav: React.FC<SettingsTabNavProps> = ({ activeTab, onChange }) => {
  const { t } = useTranslation('settings');
  const registered = useSyncExternalStore(
    (cb) => settingsTabRegistry.subscribe(cb),
    () => settingsTabRegistry.list(),
  );
  const groups: TabGroup[] = registered.length === 0
    ? TAB_GROUPS
    : [
        ...TAB_GROUPS,
        {
          id: 'extensions',
          labelKey: 'tabGroup.extensions',
          fallback: '扩展',
          items: registered.map((tab) => ({ id: tab.id, icon: tab.icon as LucideIcon, labelKey: tab.labelKey as LabelKey })),
        },
      ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {groups.map((group) => (
        <div key={group.id} className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-foreground/70">
            {t(group.labelKey, group.fallback)}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                aria-pressed={activeTab === item.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                  activeTab === item.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="size-3.5" /> {t(item.labelKey)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SettingsTabNav;
