/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 视图条件编辑器：渲染 and/or/not 条件树，支持在任意分组内增删叶子与嵌套分组。 */
import { Plus, Trash2 } from 'lucide-react';
import React from 'react';

import { useTranslation } from '@/i18n';
import { Button } from '@/shared/ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/shared/ui/DropdownMenu';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';

import type { ConditionOperator, QueryCondition } from './types';
import type { ConditionGroupType } from './viewConditions';
import { collectConditionLeaves } from './viewConditions';

const CONDITION_OPERATORS: readonly ConditionOperator[] = [
  'eq',
  'neq',
  'contains',
  'notContains',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'notEmpty',
];

const CONDITION_GROUP_TYPES: readonly ConditionGroupType[] = ['and', 'or', 'not'];

export interface ViewConditionEditorProps {
  /** 当前条件树；undefined 表示无筛选条件。 */
  condition: QueryCondition | undefined;
  /** 可选字段：来自行数据的字段键。 */
  availableFields: readonly string[];
  /** 字段显示名：面板内置映射与类型注册表字段标题。 */
  fieldLabel: (field: string) => string;
  /** 新建叶子的三个输入及其当前值。 */
  field: string;
  operator: ConditionOperator;
  value: string;
  onFieldChange: (field: string) => void;
  onOperatorChange: (operator: ConditionOperator) => void;
  onValueChange: (value: string) => void;
  /** 在 path 指向的分组内追加叶子；path 为空指向根分组。 */
  onAddLeaf: (path: readonly number[]) => void;
  /** 在 path 指向的分组内追加一个空分组。 */
  onAddGroup: (path: readonly number[], type: ConditionGroupType) => void;
  /** 删除 path 指向的节点（叶子或整个分组）。 */
  onRemove: (path: readonly number[]) => void;
}

/** 条件编辑器：树形展示 + 行内增删；文案与取值由调用方经 props 注入。 */
const ViewConditionEditor: React.FC<ViewConditionEditorProps> = ({
  condition,
  availableFields,
  fieldLabel,
  field,
  operator,
  value,
  onFieldChange,
  onOperatorChange,
  onValueChange,
  onAddLeaf,
  onAddGroup,
  onRemove,
}) => {
  const { t } = useTranslation('world');
  const groupLabels: Record<ConditionGroupType, string> = {
    and: t('views.query.group.and'),
    or: t('views.query.group.or'),
    not: t('views.query.group.not'),
  };

  const renderNode = (node: QueryCondition, path: readonly number[]): React.ReactNode => {
    if (node.type === 'leaf') {
      return (
        <span key={path.join('.')} className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
          {`${fieldLabel(node.field)} ${t(`views.query.op.${node.operator}`)}${node.value !== undefined ? ` ${node.value}` : ''}`}
          <button
            type="button"
            aria-label={t('views.query.removeCondition')}
            className="touch-target text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(path)}
          >
            <Trash2 className="size-3" />
          </button>
        </span>
      );
    }
    return (
      <div key={path.join('.')} className="flex flex-wrap items-center gap-1 rounded border border-dashed border-border p-1">
        <span className="rounded bg-muted px-1 text-2xs text-muted-foreground">{groupLabels[node.type]}</span>
        {node.children.map((child, index) => renderNode(child, [...path, index]))}
        <Button size="sm" variant="ghost" className="h-6 px-1 text-2xs" onClick={() => onAddLeaf(path)}>
          <Plus className="size-3" />
          {t('views.query.addChild')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 px-1 text-2xs">
              {t('views.query.addGroup')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('views.query.addGroup')}</DropdownMenuLabel>
            {CONDITION_GROUP_TYPES.map((type) => (
              <DropdownMenuItem key={type} onSelect={() => onAddGroup(path, type)}>
                <span>{groupLabels[type]}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {path.length > 0 && (
          <button
            type="button"
            aria-label={t('views.query.removeGroup')}
            className="touch-target text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(path)}
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{t('views.query.conditions')}</span>
        {collectConditionLeaves(condition).length === 0 && <span className="text-foreground/70">{t('views.query.noConditions')}</span>}
      </div>
      {condition && renderNode(condition, [])}
      <div className="flex flex-wrap items-center gap-1">
        <Select value={field} onChange={(event) => onFieldChange(event.target.value)} className="h-7 w-auto text-2xs" aria-label={t('views.query.field')}>
          {availableFields.map((item) => (
            <option key={item} value={item}>{fieldLabel(item)}</option>
          ))}
        </Select>
        <Select
          value={operator}
          onChange={(event) => onOperatorChange(event.target.value as ConditionOperator)}
          className="h-7 w-auto text-2xs"
          aria-label={t('views.query.operator')}
        >
          {CONDITION_OPERATORS.map((item) => (
            <option key={item} value={item}>{t(`views.query.op.${item}`)}</option>
          ))}
        </Select>
        {operator !== 'empty' && operator !== 'notEmpty' && (
          <Input
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={t('views.query.valuePlaceholder')}
            aria-label={t('views.query.value')}
            className="h-7 max-w-32 text-2xs"
          />
        )}
        <Button size="sm" variant="outline" className="h-7" onClick={() => onAddLeaf([])}>
          <Plus className="size-3" />
          {t('views.query.addCondition')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7" title={t('views.query.addGroup')}>
              {t('views.query.addGroup')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('views.query.addGroup')}</DropdownMenuLabel>
            {CONDITION_GROUP_TYPES.map((type) => (
              <DropdownMenuItem key={type} onSelect={() => onAddGroup([], type)}>
                <span>{groupLabels[type]}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default ViewConditionEditor;
