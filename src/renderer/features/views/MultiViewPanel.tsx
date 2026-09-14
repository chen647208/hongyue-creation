/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 多视图面板：同一份作品数据可在表格/卡片/图之间切换，布局存入 ViewDefinition。 */
import { STORAGE_KEYS } from '@shared/constants/storageKeys';
import type { Project } from '@shared/types';
import { BookOpen, LayoutGrid, ListOrdered, Network, Plus, Table2, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { useGenericModelStore } from '@/app/stores/genericModelStore';
import { useTranslation } from '@/i18n';
import { localStore } from '@/shared/services/localStore';
import { Button } from '@/shared/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/Card';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/shared/ui/DropdownMenu';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { ViewModeToggle } from '@/shared/ui/ViewModeToggle';
import { cn } from '@/shared/utils/cn';

import { buildEntityView } from './buildEntityView';
import type { AggregationKind, ConditionOperator, QueryLeaf, ViewRow } from './types';
import ViewCards from './ViewCards';
import ViewGraph from './ViewGraph';
import { DEFAULT_VIEW_LAYOUT, parseViewLayout, serializeViewLayout } from './viewLayout';
import ViewOutline from './ViewOutline';
import { aggregateRows, applyViewQuery } from './viewQuery';
import ViewReader from './ViewReader';
import ViewTable from './ViewTable';

interface MultiViewPanelProps {
  project: Project;
  onSelectItem?: (type: string, id: string) => void;
}

const MultiViewPanel: React.FC<MultiViewPanelProps> = ({ project, onSelectItem }) => {
  const { t } = useTranslation('world');
  const views = useGenericModelStore((state) => state.views);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState(DEFAULT_VIEW_LAYOUT);
  const [dragViewId, setDragViewId] = useState<string | null>(null);
  const [resize, setResize] = useState<{ startY: number; base: number } | null>(null);
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  const [condField, setCondField] = useState('title');
  const [condOperator, setCondOperator] = useState<ConditionOperator>('contains');
  const [condValue, setCondValue] = useState('');
  const [aggField, setAggField] = useState('title');
  const [aggKind, setAggKind] = useState<AggregationKind>('count');

  const data = useMemo(() => buildEntityView(project), [project]);

  useEffect(() => {
    void useGenericModelStore.getState().load(project.id);
  }, [project.id]);

  // 记住每个作品上次选中的视图（面板开合由功能开关持久化）。
  useEffect(() => {
    try {
      const raw = localStore.getItem(STORAGE_KEYS.viewsSelected);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      setActiveId(map[project.id] ?? null);
    } catch {
      setActiveId(null);
    }
  }, [project.id]);

  const selectView = (id: string | null) => {
    setActiveId(id);
    try {
      const raw = localStore.getItem(STORAGE_KEYS.viewsSelected);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      if (id) map[project.id] = id;
      else delete map[project.id];
      localStore.setItem(STORAGE_KEYS.viewsSelected, JSON.stringify(map));
    } catch {
      // 存储不可用时仅内存生效
    }
  };

  const entityViews = useMemo(() => views.filter((view) => view.viewType === 'entity'), [views]);
  const activeView = entityViews.find((view) => view.id === activeId) ?? entityViews[0] ?? null;
  const layout = activeView ? parseViewLayout(activeView.config) : draft;

  const setLayout = (patch: Partial<typeof layout>) => {
    const next = { ...layout, ...patch };
    if (activeView) {
      void useGenericModelStore.getState().saveView({ ...activeView, config: serializeViewLayout(next) });
    } else {
      setDraft(next);
    }
  };

  const createView = async () => {
    const id = `view:${project.id}:${crypto.randomUUID()}`;
    await useGenericModelStore.getState().saveView({
      id,
      workId: project.id,
      name: `${t('views.defaultName')} ${entityViews.length + 1}`,
      viewType: 'entity',
      config: serializeViewLayout(layout),
      orderIndex: entityViews.length,
    });
    selectView(id);
  };

  const removeView = async () => {
    if (!activeView) return;
    await useGenericModelStore.getState().deleteView(activeView.id);
    selectView(null);
  };

  const reorderViews = async (fromId: string, toId: string) => {
    const from = entityViews.findIndex((view) => view.id === fromId);
    const to = entityViews.findIndex((view) => view.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...entityViews];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    for (let index = 0; index < next.length; index += 1) {
      const view = next[index];
      if (view && view.orderIndex !== index) {
        await useGenericModelStore.getState().saveView({ ...view, orderIndex: index });
      }
    }
  };

  const moveView = (id: string, delta: number) => {
    const from = entityViews.findIndex((view) => view.id === id);
    const target = entityViews[from + delta];
    if (from < 0 || !target) return;
    void reorderViews(id, target.id);
  };

  const kindLabel = (kind: string): string => {
    switch (kind) {
      case 'character':
        return t('views.kind.character');
      case 'location':
        return t('views.kind.location');
      case 'faction':
        return t('views.kind.faction');
      case 'knowledge':
        return t('views.kind.knowledge');
      case 'event':
        return t('views.kind.event');
      default:
        return kind;
    }
  };

  const columnLabels: Record<string, string> = {
    kind: t('views.col.kind'),
    title: t('views.col.title'),
    summary: t('views.col.summary'),
    detail: t('views.col.detail'),
  };
  const queryFieldLabels: Record<string, string> = {
    kind: t('views.query.fields.kind'),
    title: t('views.query.fields.title'),
    summary: t('views.query.fields.summary'),
    detail: t('views.query.fields.detail'),
    name: t('views.query.fields.name'),
    gender: t('views.query.fields.gender'),
    age: t('views.query.fields.age'),
    role: t('views.query.fields.role'),
    occupation: t('views.query.fields.occupation'),
    factionId: t('views.query.fields.factionId'),
    currentLocationId: t('views.query.fields.currentLocationId'),
    type: t('views.query.fields.type'),
    controlledBy: t('views.query.fields.controlledBy'),
    memberCount: t('views.query.fields.memberCount'),
    date: t('views.query.fields.date'),
    year: t('views.query.fields.year'),
    month: t('views.query.fields.month'),
    day: t('views.query.fields.day'),
  };
  const queryFieldLabel = (field: string): string => queryFieldLabels[field] ?? field;
  const conditionOperatorLabels: Record<ConditionOperator, string> = {
    eq: t('views.query.op.eq'),
    neq: t('views.query.op.neq'),
    contains: t('views.query.op.contains'),
    notContains: t('views.query.op.notContains'),
    gt: t('views.query.op.gt'),
    gte: t('views.query.op.gte'),
    lt: t('views.query.op.lt'),
    lte: t('views.query.op.lte'),
    empty: t('views.query.op.empty'),
    notEmpty: t('views.query.op.notEmpty'),
  };
  const aggregationKindLabels: Record<AggregationKind, string> = {
    count: t('views.query.agg.count'),
    sum: t('views.query.agg.sum'),
    avg: t('views.query.agg.avg'),
    longest: t('views.query.agg.longest'),
    latest: t('views.query.agg.latest'),
  };
  const projection = useMemo(
    () =>
      applyViewQuery(data, {
        conditions: layout.conditions,
        computed: layout.computed,
        aggregations: layout.aggregations,
      }),
    [data, layout.conditions, layout.computed, layout.aggregations],
  );
  const displayColumns = projection.columns.map((column) => ({ ...column, label: columnLabels[column.key] ?? column.label }));

  const availableFields = useMemo(() => {
    const keys = new Set<string>();
    for (const row of data.rows) {
      for (const key of Object.keys(row.cells)) keys.add(key);
      for (const key of Object.keys(row.values ?? {})) keys.add(key);
    }
    return [...keys];
  }, [data]);

  const rows = layout.kindFilter && layout.kindFilter !== 'all' ? projection.rows.filter((row) => row.kind === layout.kindFilter) : projection.rows;
  const aggregations = useMemo(() => aggregateRows(rows, layout.aggregations), [rows, layout.aggregations]);
  const conditionLeaves = layout.conditions?.type === 'and' ? layout.conditions.children.filter((child): child is QueryLeaf => child.type === 'leaf') : [];

  const addCondition = () => {
    const leaf: QueryLeaf = { type: 'leaf', field: condField, operator: condOperator };
    if (condOperator !== 'empty' && condOperator !== 'notEmpty') leaf.value = condValue;
    setLayout({ conditions: { type: 'and', children: [...conditionLeaves, leaf] } });
  };

  const removeCondition = (index: number) => {
    const next = conditionLeaves.filter((_, position) => position !== index);
    setLayout({ conditions: next.length > 0 ? { type: 'and', children: next } : undefined });
  };

  const addAggregation = () => {
    setLayout({ aggregations: [...(layout.aggregations ?? []), { field: aggField, kind: aggKind }] });
  };

  const removeAggregation = (index: number) => {
    const next = (layout.aggregations ?? []).filter((_, position) => position !== index);
    setLayout({ aggregations: next.length > 0 ? next : undefined });
  };

  const bodyHeight = liveHeight ?? layout.height ?? 440;

  const handleSelectRow = (row: ViewRow) => {
    onSelectItem?.(row.kind === 'event' ? 'timeline' : row.kind, row.id);
  };

  const showColumn = (key: string) => {
    const column = projection.columns.find((item) => item.key === key);
    if (!column) return;
    setLayout({
      hidden: layout.hidden.filter((hiddenKey) => hiddenKey !== key),
      columns: [...layout.columns.filter((item) => item.key !== key), column],
    });
  };

  const kindOrder = ['character', 'location', 'faction', 'knowledge', 'event'];

  const options = [
    { value: 'table' as const, icon: Table2, title: t('views.kind.table') },
    { value: 'card' as const, icon: LayoutGrid, title: t('views.kind.card') },
    { value: 'graph' as const, icon: Network, title: t('views.kind.graph') },
    { value: 'list' as const, icon: ListOrdered, title: t('views.kind.list') },
    { value: 'reader' as const, icon: BookOpen, title: t('views.kind.reader') },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">{t('views.title')}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {entityViews.length > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              {entityViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  draggable
                  aria-label={t('views.reorderHint')}
                  title={t('views.reorderHint')}
                  onDragStart={() => setDragViewId(view.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragViewId) void reorderViews(dragViewId, view.id);
                    setDragViewId(null);
                  }}
                  onKeyDown={(event) => {
                    if (!event.altKey) return;
                    if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      moveView(view.id, -1);
                    } else if (event.key === 'ArrowRight') {
                      event.preventDefault();
                      moveView(view.id, 1);
                    }
                  }}
                  onClick={() => selectView(view.id)}
                  className={cn(
                    'motion-hover motion-press cursor-grab rounded border px-2 py-0.5 text-2xs',
                    activeView?.id === view.id ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground',
                  )}
                >
                  {view.name}
                </button>
              ))}
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => void createView()}>
            <Plus className="size-3.5" />
            {t('views.save')}
          </Button>
          {activeView && (
            <Button size="sm" variant="ghost" aria-label={t('views.remove')} onClick={() => void removeView()}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <ViewModeToggle value={layout.kind} onChange={(kind) => setLayout({ kind })} options={options} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">{t('views.columns')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {displayColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={!layout.hidden.includes(column.key)}
                  onCheckedChange={(checked) =>
                    setLayout({
                      hidden: checked ? layout.hidden.filter((key) => key !== column.key) : [...layout.hidden, column.key],
                    })
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <details className="mb-3 text-2xs">
          <summary className="cursor-pointer text-muted-foreground">{t('views.customize')}</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t('views.fields')}</span>
            <div
              className="flex flex-wrap items-center gap-1"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const key = event.dataTransfer.getData('text/plain');
                if (key.startsWith('col:')) showColumn(key.slice(4));
              }}
            >
            {projection.columns.map((column) => (
              <span
                key={column.key}
                draggable
                title={t('views.dragColumn')}
                onDragStart={(event) => event.dataTransfer.setData('text/plain', `col:${column.key}`)}
                className="cursor-grab rounded border border-border px-1.5 py-0.5"
              >
                {displayColumns.find((item) => item.key === column.key)?.label ?? column.key}
              </span>
            ))}
            <span className="rounded border border-dashed border-border px-1.5 py-0.5 text-muted-foreground">{t('views.dropColumn')}</span>
          </div>
          <span className="text-muted-foreground">{t('views.kinds')}</span>
          <div
            className="flex flex-wrap items-center gap-1"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const kind = event.dataTransfer.getData('text/plain');
              if (kind.startsWith('kind:')) setLayout({ kindFilter: kind.slice(5) });
            }}
          >
            {kindOrder.map((kind) => (
              <span
                key={kind}
                draggable
                title={t('views.dragKind')}
                onDragStart={(event) => event.dataTransfer.setData('text/plain', `kind:${kind}`)}
                className="cursor-grab rounded border border-border px-1.5 py-0.5"
              >
                {kindLabel(kind)}
              </span>
            ))}
            <button type="button" className="rounded border border-dashed border-border px-1.5 py-0.5 text-muted-foreground" onClick={() => setLayout({ kindFilter: undefined })}>
              {t('views.allKinds')}
            </button>
            </div>
          </div>
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('views.query.conditions')}</span>
              {conditionLeaves.length === 0 && <span className="text-muted-foreground/70">{t('views.query.noConditions')}</span>}
            </div>
            {conditionLeaves.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {conditionLeaves.map((leaf, index) => (
                  <span key={`${leaf.field}-${index}`} className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                    {`${queryFieldLabel(leaf.field)} ${conditionOperatorLabels[leaf.operator]}${leaf.value !== undefined ? ` ${leaf.value}` : ''}`}
                    <button
                      type="button"
                      aria-label={t('views.query.removeCondition')}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeCondition(index)}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1">
              <Select value={condField} onChange={(event) => setCondField(event.target.value)} className="h-7 w-auto text-2xs" aria-label={t('views.query.field')}>
                {availableFields.map((field) => (
                  <option key={field} value={field}>{queryFieldLabel(field)}</option>
                ))}
              </Select>
              <Select value={condOperator} onChange={(event) => setCondOperator(event.target.value as ConditionOperator)} className="h-7 w-auto text-2xs" aria-label={t('views.query.operator')}>
                {(Object.keys(conditionOperatorLabels) as ConditionOperator[]).map((operator) => (
                  <option key={operator} value={operator}>{conditionOperatorLabels[operator]}</option>
                ))}
              </Select>
              {condOperator !== 'empty' && condOperator !== 'notEmpty' && (
                <Input
                  value={condValue}
                  onChange={(event) => setCondValue(event.target.value)}
                  placeholder={t('views.query.valuePlaceholder')}
                  aria-label={t('views.query.value')}
                  className="h-7 max-w-32 text-2xs"
                />
              )}
              <Button size="sm" variant="outline" className="h-7" onClick={addCondition}>
                <Plus className="size-3" />
                {t('views.query.addCondition')}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">{t('views.query.aggregations')}</span>
              <Select value={aggField} onChange={(event) => setAggField(event.target.value)} className="h-7 w-auto text-2xs" aria-label={t('views.query.field')}>
                {availableFields.map((field) => (
                  <option key={field} value={field}>{queryFieldLabel(field)}</option>
                ))}
              </Select>
              <Select value={aggKind} onChange={(event) => setAggKind(event.target.value as AggregationKind)} className="h-7 w-auto text-2xs" aria-label={t('views.query.aggregationKind')}>
                {(Object.keys(aggregationKindLabels) as AggregationKind[]).map((kind) => (
                  <option key={kind} value={kind}>{aggregationKindLabels[kind]}</option>
                ))}
              </Select>
              <Button size="sm" variant="outline" className="h-7" onClick={addAggregation}>
                <Plus className="size-3" />
                {t('views.query.addAggregation')}
              </Button>
            </div>
          </div>
        </details>
        {aggregations.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-2xs">
            {aggregations.map((result, index) => (
              <span key={`${result.field}-${result.kind}-${index}`} className="flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-0.5">
                {`${queryFieldLabel(result.field)} · ${aggregationKindLabels[result.kind]}：${result.value}`}
                <button
                  type="button"
                  aria-label={t('views.query.removeAggregation')}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeAggregation(index)}
                >
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div style={{ height: bodyHeight }} className="overflow-hidden">
          {layout.kind === 'table' && (
            <ViewTable
              rows={rows}
              columns={displayColumns}
              hidden={layout.hidden}
              sortKey={layout.sortKey}
              sortDesc={layout.sortDesc}
              emptyText={t('views.empty')}
              onSortChange={(key, desc) => setLayout({ sortKey: key, sortDesc: desc })}
              onHiddenChange={(hidden) => setLayout({ hidden })}
              onSelectRow={handleSelectRow}
            />
          )}
          {layout.kind === 'card' && (
            <ViewCards rows={rows} kindLabel={kindLabel} emptyText={t('views.empty')} onSelectRow={handleSelectRow} />
          )}
          {layout.kind === 'graph' && (
            <ViewGraph rows={rows} links={data.links} kindLabel={kindLabel} emptyText={t('views.empty')} onSelectRow={handleSelectRow} />
          )}
          {layout.kind === 'list' && (
            <ViewOutline rows={rows} kindLabel={kindLabel} emptyText={t('views.empty')} onSelectRow={handleSelectRow} />
          )}
          {layout.kind === 'reader' && (
            <ViewReader rows={rows} device={layout.readerDevice ?? 'desktop'} emptyText={t('views.empty')} onDeviceChange={(device) => setLayout({ readerDevice: device })} />
          )}
        </div>
        <div
          role="separator"
          aria-label={t('views.resize')}
          title={t('views.resize')}
          className="mt-1 h-2 cursor-ns-resize rounded bg-border/50 hover:bg-primary/40"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setResize({ startY: event.clientY, base: bodyHeight });
          }}
          onPointerMove={(event) => {
            if (!resize) return;
            setLiveHeight(Math.max(160, Math.min(900, resize.base + (event.clientY - resize.startY))));
          }}
          onPointerUp={() => {
            if (resize && liveHeight !== null) setLayout({ height: liveHeight });
            setResize(null);
            setLiveHeight(null);
          }}
        />
      </CardContent>
    </Card>
  );
};

export default MultiViewPanel;
