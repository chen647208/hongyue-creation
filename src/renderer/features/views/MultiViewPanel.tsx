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
import { BarChart3, BookmarkPlus, BookOpen, FileDown, LayoutDashboard, LayoutGrid, ListOrdered, Network, Plus, Table2, Trash2, Upload } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { useGenericModelStore } from '@/app/stores/genericModelStore';
import { useTranslation } from '@/i18n';
import { dt } from '@/i18n/dynamic';
import { dialogService } from '@/shared/services/dialogService';
import { pickTextFile } from '@/shared/services/fileOpen';
import { saveTextFile } from '@/shared/services/fileSave';
import { localStore } from '@/shared/services/localStore';
import { formulaRegistry } from '@/shared/services/viewFormulas';
import { Button } from '@/shared/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/Card';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/shared/ui/DropdownMenu';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { ViewModeToggle } from '@/shared/ui/ViewModeToggle';
import { cn } from '@/shared/utils/cn';

import { buildEntityView } from './buildEntityView';
import { addCanvasEdge, mergeCanvasDocument, moveCanvasNode, projectCanvas, removeCanvasEdge } from './canvasView';
import { parseCanvasText, serializeCanvas } from './jsonCanvas';
import type { AggregationKind, CanvasPoint, ChartChannel, ChartMark, ConditionOperator, QueryLeaf, ViewColumn, ViewRow } from './types';
import ViewCards from './ViewCards';
import { DEFAULT_CHART_SPEC, projectChart } from './viewChart';
import { serializeViewTable, type TableFormat } from './viewExport';
import ViewGraph from './ViewGraph';
import { DEFAULT_VIEW_LAYOUT, parseViewLayout, serializeViewLayout } from './viewLayout';
import ViewOutline from './ViewOutline';
import { VIEW_PRESETS, type ViewPreset } from './viewPresets';
import { aggregateRows, applyViewQuery } from './viewQuery';
import ViewReader from './ViewReader';
import ViewTable from './ViewTable';

/** 图表渲染器按需加载：不进默认视图包。 */
const LazyViewChart = React.lazy(() => import('./ChartView'));

/** 画布渲染器按需加载：不进默认视图包。 */
const LazyCanvasView = React.lazy(() => import('./ViewCanvas'));

const CHART_MARKS: readonly ChartMark[] = ['bar', 'point', 'line', 'area'];
const CHART_CHANNELS: readonly ChartChannel[] = ['x', 'y', 'color', 'size', 'shape'];

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
      case 'chapter':
        return t('views.kind.chapter');
      case 'foreshadow':
        return t('views.kind.foreshadow');
      case 'rule':
        return t('views.kind.rule');
      case 'world':
        return t('views.kind.world');
      case 'plan':
        return t('views.kind.plan');
      case 'group':
        return t('views.kind.group');
      case 'reference':
        return t('views.kind.reference');
      case 'branch-scene':
        return t('views.kind.branchScene');
      case 'picture-page':
        return t('views.kind.picturePage');
      case 'translation-pair':
        return t('views.kind.translationPair');
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
  // 列标签：内置列走映射；预设列的 label 为 world 命名空间 i18n 键（`views.` 前缀）。
  const columnLabel = (column: ViewColumn): string => {
    const mapped = columnLabels[column.key];
    if (mapped) return mapped;
    return column.label.startsWith('views.') ? dt(`world:${column.label}`) : column.label;
  };
  const paramLabel = (name: string): string => dt(`world:views.computed.param.${name}`, { defaultValue: name });
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
  // 字段标签：内置/查询字段走映射，预设 i18n 键走 world 命名空间，扩展字段回落原始键。
  const fieldLabel = (key: string): string => {
    const known = columnLabels[key] ?? queryFieldLabels[key];
    if (known) return known;
    return key.startsWith('views.') ? dt(`world:${key}`) : key;
  };
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
        aliases: layout.fieldAliases,
      }),
    [data, layout.conditions, layout.computed, layout.aggregations, layout.fieldAliases],
  );
  const displayColumns = projection.columns.map((column) => ({ ...column, label: columnLabel(column) }));

  // 图表：轴与图例由「字段→通道」声明派生，投影为纯函数。
  const chartSpec = layout.chart ?? DEFAULT_CHART_SPEC;
  const chartProjection = useMemo(() => projectChart(projection, layout.chart), [projection, layout.chart]);
  const chartBindingField = (channel: ChartChannel): string => chartSpec.bindings.find((binding) => binding.channel === channel)?.field ?? '';
  const setChartMark = (mark: ChartMark) => setLayout({ chart: { mark, bindings: chartSpec.bindings } });
  const setChartBinding = (channel: ChartChannel, field: string) => {
    const bindings = chartSpec.bindings.filter((binding) => binding.channel !== channel);
    if (field) bindings.push({ field, channel });
    setLayout({ chart: { mark: chartSpec.mark, bindings } });
  };

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

  // 画布：行数据投影为节点，坐标与连线取自 ViewDefinition.config，拖动后写回同一份。
  const canvasProjection = useMemo(() => projectCanvas(layout.canvas, rows), [layout.canvas, rows]);
  const moveCanvasNodeById = (id: string, point: CanvasPoint) => {
    setLayout({ canvas: moveCanvasNode(layout.canvas, id, point) });
  };
  const connectCanvasNodes = (source: string, target: string) => {
    setLayout({ canvas: addCanvasEdge(layout.canvas, source, target) });
  };
  const removeCanvasEdgeById = (edgeId: string) => {
    setLayout({ canvas: removeCanvasEdge(layout.canvas, edgeId) });
  };
  const selectCanvasNode = (id: string) => {
    const row = data.rows.find((item) => item.id === id);
    if (row) handleSelectRow(row);
  };
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

  const computedColumns = layout.computed ?? [];

  const updateComputedParam = (key: string, name: string, value: number) => {
    setLayout({
      computed: computedColumns.map((column) =>
        column.key === key ? { ...column, params: { ...(column.params ?? {}), [name]: value } } : column,
      ),
    });
  };

  const removeComputed = (key: string) => {
    const next = computedColumns.filter((column) => column.key !== key);
    setLayout({ computed: next.length > 0 ? next : undefined });
  };

  // 插件贡献的公式（可序列化派生字段）：注册表在启动期填充，此处按需读取。
  const pluginFormulas = formulaRegistry.list();

  const addFormula = (formulaId: string) => {
    const formula = pluginFormulas.find((item) => item.id === formulaId);
    if (!formula) return;
    const key = `computed:${formula.id}`;
    if (computedColumns.some((column) => column.key === key)) return;
    setLayout({
      computed: [...computedColumns, { key, label: formula.label, expression: formula.expression, width: 140 }],
    });
  };

  const insertPreset = async (preset: ViewPreset) => {
    const id = `view:${project.id}:${crypto.randomUUID()}`;
    await useGenericModelStore.getState().saveView({
      id,
      workId: project.id,
      name: dt(`world:${preset.nameKey}`),
      viewType: 'entity',
      config: serializeViewLayout(preset.layout),
      orderIndex: entityViews.length,
    });
    selectView(id);
  };

  const exportTable = (format: TableFormat) => {
    const columns = displayColumns.filter((column) => !layout.hidden.includes(column.key));
    const labels = Object.fromEntries(columns.map((column) => [column.key, column.label]));
    const content = serializeViewTable({ columns, rows }, format, { labels });
    const extension = format === 'md' ? 'md' : format === 'csv' ? 'csv' : 'html';
    const mime = format === 'csv' ? 'text/csv' : format === 'html' ? 'text/html' : 'text/markdown';
    const safeName = (activeView?.name ?? project.title).replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${project.title}_${safeName}.${extension}`;
    void saveTextFile(filename, content, {
      mime,
      extension,
      filterName: t('views.export.label'),
      dialogTitle: t('views.export.label'),
    }).catch((error) => {
      dialogService.alert(t('views.export.failed', { error: error instanceof Error ? error.message : String(error) }));
    });
  };

  // 画布导出为 .canvas（JSON Canvas 开放格式），导入按行 id 与节点 id 合并进当前视图。
  const exportCanvas = () => {
    const content = serializeCanvas({ nodes: canvasProjection.nodes, edges: canvasProjection.edges });
    const safeName = (activeView?.name ?? project.title).replace(/[\\/:*?"<>|]/g, '_');
    void saveTextFile(`${project.title}_${safeName}.canvas`, content, {
      mime: 'application/json',
      extension: 'canvas',
      filterName: t('views.canvas.format'),
      dialogTitle: t('views.canvas.export'),
    }).catch((error) => {
      dialogService.alert(t('views.canvas.exportFailed', { error: error instanceof Error ? error.message : String(error) }));
    });
  };

  const importCanvas = async () => {
    let text: string | null;
    try {
      text = await pickTextFile({ title: t('views.canvas.importLabel'), filterName: t('views.canvas.format'), extension: 'canvas' });
    } catch (error) {
      dialogService.alert(t('views.canvas.importFailed', { error: error instanceof Error ? error.message : String(error) }));
      return;
    }
    if (text === null) return;
    const parsed = parseCanvasText(text);
    if (!parsed.ok) {
      dialogService.alert(t('views.canvas.importFailed', { error: parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ') }));
      return;
    }
    const merged = mergeCanvasDocument(layout.canvas, rows, parsed.document);
    setLayout({ canvas: merged.layout });
    const skipped = parsed.issues.length + merged.skippedEdges;
    if (skipped > 0) dialogService.alert(t('views.canvas.importSkipped', { count: skipped }));
  };

  const bodyHeight = liveHeight ?? layout.height ?? 440;

  const handleSelectRow = (row: ViewRow) => {
    onSelectItem?.(row.kind === 'event' ? 'timeline' : row.kind, row.id);
  };

  const showColumn = (key: string) => {
    const existing = projection.columns.find((item) => item.key === key) ?? layout.columns.find((item) => item.key === key);
    const column = existing ?? { key, label: fieldLabel(key), width: 140 };
    setLayout({
      hidden: layout.hidden.filter((hiddenKey) => hiddenKey !== key),
      columns: [...layout.columns.filter((item) => item.key !== key), column],
    });
  };

  // 任一域都可能是行来源：类型筛选按当前数据的 kind 动态生成，已知类型优先排序。
  const kindOrder = useMemo(() => {
    const preferred = ['character', 'location', 'faction', 'event', 'chapter', 'branch-scene', 'picture-page', 'knowledge', 'foreshadow', 'rule', 'world', 'plan', 'group'];
    const present = [...new Set(data.rows.map((row) => row.kind))];
    return [...preferred.filter((kind) => present.includes(kind)), ...present.filter((kind) => !preferred.includes(kind)).sort()];
  }, [data]);

  const options = [
    { value: 'table' as const, icon: Table2, title: t('views.kind.table') },
    { value: 'card' as const, icon: LayoutGrid, title: t('views.kind.card') },
    { value: 'graph' as const, icon: Network, title: t('views.kind.graph') },
    { value: 'chart' as const, icon: BarChart3, title: t('views.kind.chart') },
    { value: 'canvas' as const, icon: LayoutDashboard, title: t('views.kind.canvas') },
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
            <Button size="sm" variant="ghost" iconOnly aria-label={t('views.remove')} onClick={() => void removeView()}>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" title={t('views.preset.insert')}>
                <BookmarkPlus className="size-3.5" />
                {t('views.preset.insert')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('views.preset.insert')}</DropdownMenuLabel>
              {VIEW_PRESETS.map((preset) => (
                <DropdownMenuItem key={preset.id} onSelect={() => void insertPreset(preset)}>
                  <span>{dt(`world:${preset.nameKey}`)}</span>
                  <span className="truncate text-2xs text-muted-foreground">{dt(`world:${preset.descriptionKey}`)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" title={t('views.export.label')}>
                <FileDown className="size-3.5" />
                {t('views.export.label')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportTable('md')}>{t('views.export.markdown')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportTable('csv')}>{t('views.export.csv')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportTable('html')}>{t('views.export.html')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {layout.kind === 'canvas' && (
            <Button size="sm" variant="outline" title={t('views.canvas.export')} onClick={exportCanvas}>
              <FileDown className="size-3.5" />
              {t('views.canvas.export')}
            </Button>
          )}
          {layout.kind === 'canvas' && (
            <Button size="sm" variant="outline" title={t('views.canvas.importLabel')} onClick={() => void importCanvas()}>
              <Upload className="size-3.5" />
              {t('views.canvas.importLabel')}
            </Button>
          )}
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
            {availableFields.map((key) => (
              <span
                key={key}
                draggable
                title={t('views.dragColumn')}
                onDragStart={(event) => event.dataTransfer.setData('text/plain', `col:${key}`)}
                className="cursor-grab rounded border border-border px-1.5 py-0.5"
              >
                {fieldLabel(key)}
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
              {conditionLeaves.length === 0 && <span className="text-foreground/70">{t('views.query.noConditions')}</span>}
            </div>
            {conditionLeaves.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {conditionLeaves.map((leaf, index) => (
                  <span key={`${leaf.field}-${index}`} className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                    {`${queryFieldLabel(leaf.field)} ${conditionOperatorLabels[leaf.operator]}${leaf.value !== undefined ? ` ${leaf.value}` : ''}`}
                    <button
                      type="button"
                      aria-label={t('views.query.removeCondition')}
                      className="touch-target text-muted-foreground hover:text-destructive"
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
            <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
              <span className="text-muted-foreground">{t('views.computed.title')}</span>
              {computedColumns.length === 0 && <span className="text-foreground/70">{t('views.computed.empty')}</span>}
              {computedColumns.map((column) => (
                <span key={column.key} className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                  <span>{columnLabel({ key: column.key, label: column.label })}</span>
                  {Object.entries(column.params ?? {}).map(([name, value]) => (
                    <label key={name} className="flex items-center gap-1">
                      <span className="text-muted-foreground">{paramLabel(name)}</span>
                      <Input
                        type="number"
                        value={value}
                        onChange={(event) => updateComputedParam(column.key, name, Number(event.target.value))}
                        aria-label={paramLabel(name)}
                        className="h-6 w-16 text-2xs"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    aria-label={t('views.computed.remove')}
                    className="touch-target text-muted-foreground hover:text-destructive"
                    onClick={() => removeComputed(column.key)}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              ))}
              {pluginFormulas.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7" title={t('views.computed.insertFormula')}>
                      <Plus className="size-3" />
                      {t('views.computed.insertFormula')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t('views.computed.insertFormula')}</DropdownMenuLabel>
                    {pluginFormulas.map((formula) => (
                      <DropdownMenuItem key={formula.id} onSelect={() => addFormula(formula.id)}>
                        <span>{formula.label}</span>
                        {formula.description && <span className="truncate text-2xs text-muted-foreground">{formula.description}</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <span className="text-muted-foreground">{t('views.chart.title')}</span>
              <Select value={chartSpec.mark} onChange={(event) => setChartMark(event.target.value as ChartMark)} className="h-7 w-auto text-2xs" aria-label={t('views.chart.mark')}>
                {CHART_MARKS.map((mark) => (
                  <option key={mark} value={mark}>{t(`views.chart.marks.${mark}`)}</option>
                ))}
              </Select>
              {CHART_CHANNELS.map((channel) => (
                <label key={channel} className="flex items-center gap-1">
                  <span className="text-muted-foreground">{t(`views.chart.channels.${channel}`)}</span>
                  <Select
                    value={chartBindingField(channel)}
                    onChange={(event) => setChartBinding(channel, event.target.value)}
                    className="h-7 w-auto text-2xs"
                    aria-label={t(`views.chart.channels.${channel}`)}
                  >
                    <option value="">{t('views.chart.unbound')}</option>
                    {availableFields.map((field) => (
                      <option key={field} value={field}>{queryFieldLabel(field)}</option>
                    ))}
                  </Select>
                </label>
              ))}
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
                  className="touch-target text-muted-foreground hover:text-destructive"
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
          {layout.kind === 'chart' && (
            <React.Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">{t('views.chart.loading')}</p>}>
              <LazyViewChart projection={chartProjection} emptyText={t('views.empty')} />
            </React.Suspense>
          )}
          {layout.kind === 'canvas' && (
            <React.Suspense fallback={<p className="py-10 text-center text-sm text-muted-foreground">{t('views.canvas.loading')}</p>}>
              <LazyCanvasView
                projection={canvasProjection}
                emptyText={t('views.empty')}
                connectLabel={t('views.canvas.connect')}
                connectHint={t('views.canvas.connectHint')}
                cancelConnectLabel={t('views.canvas.cancelConnect')}
                removeEdgeLabel={t('views.canvas.removeEdge')}
                moveHint={t('views.canvas.moveHint')}
                nodeLabel={(node) => {
                  const title = node.text ?? node.label ?? node.url ?? node.file ?? node.id;
                  const kind = node.kind ? kindLabel(node.kind) : t('views.canvas.freeNode');
                  return t('views.canvas.nodeLabel', { kind, title });
                }}
                onMoveNode={moveCanvasNodeById}
                onConnect={connectCanvasNodes}
                onRemoveEdge={removeCanvasEdgeById}
                onSelectNode={selectCanvasNode}
              />
            </React.Suspense>
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
