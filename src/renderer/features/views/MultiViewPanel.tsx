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
import { Select } from '@/shared/ui/Select';
import { ViewModeToggle } from '@/shared/ui/ViewModeToggle';

import { buildEntityView } from './buildEntityView';
import type { ViewRow } from './types';
import ViewCards from './ViewCards';
import ViewGraph from './ViewGraph';
import { DEFAULT_VIEW_LAYOUT, parseViewLayout, serializeViewLayout } from './viewLayout';
import ViewOutline from './ViewOutline';
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
  const displayColumns = data.columns.map((column) => ({ ...column, label: columnLabels[column.key] ?? column.key }));

  const rows = layout.kindFilter && layout.kindFilter !== 'all' ? data.rows.filter((row) => row.kind === layout.kindFilter) : data.rows;

  const handleSelectRow = (row: ViewRow) => {
    onSelectItem?.(row.kind === 'event' ? 'timeline' : row.kind, row.id);
  };

  const showColumn = (key: string) => {
    const column = data.columns.find((item) => item.key === key);
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
          {entityViews.length > 0 && (
            <Select value={activeView?.id ?? ''} onChange={(event) => selectView(event.target.value)} className="h-8 w-40 text-xs">
              {entityViews.map((view) => (
                <option key={view.id} value={view.id}>{view.name}</option>
              ))}
            </Select>
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
        <div className="mb-3 flex flex-wrap items-center gap-2 text-2xs">
          <span className="text-muted-foreground">{t('views.fields')}</span>
          <div
            className="flex flex-wrap items-center gap-1"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const key = event.dataTransfer.getData('text/plain');
              if (key.startsWith('col:')) showColumn(key.slice(4));
            }}
          >
            {data.columns.map((column) => (
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
      </CardContent>
    </Card>
  );
};

export default MultiViewPanel;
