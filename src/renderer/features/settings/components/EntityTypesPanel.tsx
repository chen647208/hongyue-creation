/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 实体类型与字段管理：内置类型只读；当前作品可自定义类型与字段。 */
import { Boxes, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { type FieldDataType, useGenericModelStore } from '@/app/stores/genericModelStore';
import { useProjectStore } from '@/app/stores/projectStore';
import { useTranslation } from '@/i18n';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/Card';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';

const DATA_TYPES: FieldDataType[] = ['text', 'number', 'date', 'option', 'checkbox', 'relation', 'image', 'link', 'tag'];

const EntityTypesPanel: React.FC = () => {
  const { t } = useTranslation('settings');
  const workId = useProjectStore((s) => s.activeProjectId);
  const itemTypes = useGenericModelStore((s) => s.itemTypes);
  const fieldsByType = useGenericModelStore((s) => s.fieldsByType);
  const [typeLabel, setTypeLabel] = useState('');
  const [fieldType, setFieldType] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldDataType, setFieldDataType] = useState<FieldDataType>('text');

  useEffect(() => {
    void useGenericModelStore.getState().load(workId);
  }, [workId]);

  const builtins = itemTypes.filter((item) => item.builtin);
  const customs = itemTypes.filter((item) => !item.builtin);

  const addType = async (): Promise<void> => {
    const label = typeLabel.trim();
    if (!label || !workId) return;
    await useGenericModelStore.getState().saveItemType({
      id: `user:${workId}:${crypto.randomUUID()}`,
      workId,
      label,
      builtin: false,
    });
    setTypeLabel('');
  };

  const addField = async (itemTypeId: string): Promise<void> => {
    const label = fieldLabel.trim();
    if (!label) return;
    await useGenericModelStore.getState().saveField({
      id: `user:field:${crypto.randomUUID()}`,
      itemTypeId,
      key: `field_${Date.now().toString(36)}`,
      label,
      dataType: fieldDataType,
      required: false,
      orderIndex: (fieldsByType[itemTypeId]?.length ?? 0),
    });
    setFieldLabel('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="size-4 text-muted-foreground" />
          {t('entities.title')}
        </CardTitle>
        <CardDescription>{t('entities.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">{t('entities.builtin')}</div>
          <div className="flex flex-wrap gap-1.5">
            {builtins.map((item) => {
              const count = fieldsByType[item.id]?.length ?? 0;
              return (
                <Badge key={item.id} variant="outline" className="rounded-full text-2xs font-normal">
                  {item.label}
                  {count ? ` · ${count}` : ''}
                </Badge>
              );
            })}
          </div>
        </div>

        {!workId ? (
          <p className="text-xs text-muted-foreground">{t('entities.noWork')}</p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t('entities.custom')}</div>
              {customs.length === 0 && <p className="text-xs italic text-muted-foreground">{t('entities.empty')}</p>}
              {customs.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.label}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-destructive"
                      aria-label={t('entities.removeType')}
                      onClick={() => void useGenericModelStore.getState().deleteItemType(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(fieldsByType[item.id] ?? []).map((field) => (
                      <span key={field.id} className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-2xs text-muted-foreground">
                        {field.label} · {field.dataType}
                        <button
                          type="button"
                          className="touch-target text-muted-foreground hover:text-destructive"
                          aria-label={t('entities.removeField')}
                          onClick={() => void useGenericModelStore.getState().deleteField(field.id)}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input
                      value={fieldType === item.id ? fieldLabel : ''}
                      onChange={(e) => {
                        setFieldType(item.id);
                        setFieldLabel(e.target.value);
                      }}
                      placeholder={t('entities.fieldPlaceholder')}
                      className="h-8 max-w-40 text-xs"
                    />
                    <Select
                      value={fieldType === item.id ? fieldDataType : 'text'}
                      onChange={(e) => {
                        setFieldType(item.id);
                        setFieldDataType(e.target.value as FieldDataType);
                      }}
                      className="h-8 text-xs"
                    >
                      {DATA_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </Select>
                    <Button size="sm" variant="outline" disabled={fieldType !== item.id || !fieldLabel.trim()} onClick={() => void addField(item.id)}>
                      <Plus className="size-3.5" />
                      {t('entities.addField')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={typeLabel}
                onChange={(e) => setTypeLabel(e.target.value)}
                placeholder={t('entities.typePlaceholder')}
                className="h-8 max-w-48 text-xs"
              />
              <Button size="sm" disabled={!typeLabel.trim()} onClick={() => void addType()}>
                <Plus className="size-3.5" />
                {t('entities.addType')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default EntityTypesPanel;
