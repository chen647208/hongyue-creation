/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 内置设置页签贡献：与插件页签走同一注册表。 */
import { Cloud, Puzzle } from 'lucide-react';

import PluginSettingsPanel from './components/PluginSettingsPanel';
import SyncTransportPanel from './components/SyncTransportPanel';
import { settingsTabRegistry } from './services/settingsTabs';

export function registerCoreSettingsTabs(): void {
  settingsTabRegistry.register({
    id: 'plugins',
    icon: Puzzle,
    labelKey: 'tab.plugins',
    groupLabelKey: 'tabGroup.system',
    order: 0,
    render: () => <PluginSettingsPanel />,
  });

  settingsTabRegistry.register({
    id: 'sync',
    icon: Cloud,
    labelKey: 'tab.sync',
    groupLabelKey: 'tabGroup.system',
    order: 1,
    render: () => <SyncTransportPanel />,
  });
}
