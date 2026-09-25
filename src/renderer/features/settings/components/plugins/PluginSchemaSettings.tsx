/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

import React, { useState } from 'react';

import { useTranslation } from '@/i18n';
import { localStore } from '@/shared/services/localStore';
import { defaultFromSchema, type JsonSchemaObject, SchemaForm } from '@/shared/ui/SchemaForm';

/** 单插件设置：按 manifest.settingsSchema 渲染，值持久化在 plugin.<id>.settings。 */
const PluginSchemaSettings: React.FC<{ pluginId: string; schema: JsonSchemaObject }> = ({ pluginId, schema }) => {
  const { t } = useTranslation(['settings']);
  const key = `plugin.${pluginId}.settings`;
  const [state, setState] = useState<{ value: Record<string, unknown>; corrupt: boolean }>(() => {
    const raw = localStore.getItem(key);
    if (raw) {
      try {
        return { value: { ...defaultFromSchema(schema), ...(JSON.parse(raw) as Record<string, unknown>) }, corrupt: false };
      } catch {
        // 损坏配置：备份原值后回默认，不静默丢弃
        localStore.setItem(`${key}.corrupt`, raw);
        return { value: defaultFromSchema(schema), corrupt: true };
      }
    }
    return { value: defaultFromSchema(schema), corrupt: false };
  });
  const update = (next: Record<string, unknown>): void => {
    setState({ value: next, corrupt: false });
    localStore.setItem(key, JSON.stringify(next));
  };
  return (
    <div className="mt-2 rounded-md border border-border p-2">
      {state.corrupt && <p className="mb-2 text-xs text-warning">{t('plugins.settingsCorrupt')}</p>}
      <SchemaForm schema={schema} value={state.value} onChange={update} idPrefix={`plugin-${pluginId}`} />
    </div>
  );
};

export default PluginSchemaSettings;
