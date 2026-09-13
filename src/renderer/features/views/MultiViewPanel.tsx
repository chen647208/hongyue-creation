/*
 * 本文件属于 红月创作 (Hongyue Creation) 项目。
 * Copyright (C) 2026 chen647208
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 本程序为自由软件：您可依据 GNU Affero 通用公共许可证第 3 版（AGPL-3.0-only）修改与分发；
 * 商业闭源使用需另行获取授权，详见 docs/guides/licensing.md。
 */

/** 多视图面板：同一份作品数据可在表格/卡片/图之间切换，布局存入 ViewDefinition。 */
import type { Project } from '@shared/types';
import { LayoutGrid, ListOrdered, Network, Plus, Table2, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { useGenericModelStore } from '@/app/stores/genericModelStore';
import { useTranslation } from '@/i18n';
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
    setActiveId(id);
  };

  const removeView = async () => {
    if (!activeView) return;
    await useGenericModelStore.getState().deleteView(activeView.id);
    setActiveId(null);
  };

  const kindLabel = (kind: string): string => {
    switch (kind) {
      case 'character':
        return t('views.kind.character');
      case 'location':
        return t('views.kind.location');
      case 'faction':
        return t('views.kind.faction');
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

  const handleSelectRow = (row: ViewRow) => {
    onSelectItem?.(row.kind === 'event' ? 'timeline' : row.kind, row.id);
  };

  const options = [
    { value: 'table' as const, icon: Table2, title: t('views.kind.table') },
    { value: 'card' as const, icon: LayoutGrid, title: t('views.kind.card') },
    { value: 'graph' as const, icon: Network, title: t('views.kind.graph') },
    { value: 'list' as const, icon: ListOrdered, title: t('views.kind.list') },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">{t('views.title')}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {entityViews.length > 0 && (
            <Select value={activeView?.id ?? ''} onChange={(event) => setActiveId(event.target.value)} className="h-8 w-40 text-xs">
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
        {layout.kind === 'table' && (
          <ViewTable
            rows={data.rows}
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
          <ViewCards rows={data.rows} kindLabel={kindLabel} emptyText={t('views.empty')} onSelectRow={handleSelectRow} />
        )}
        {layout.kind === 'graph' && (
          <ViewGraph rows={data.rows} links={data.links} kindLabel={kindLabel} emptyText={t('views.empty')} onSelectRow={handleSelectRow} />
        )}
        {layout.kind === 'list' && (
          <ViewOutline rows={data.rows} kindLabel={kindLabel} emptyText={t('views.empty')} onSelectRow={handleSelectRow} />
        )}
      </CardContent>
    </Card>
  );
};

export default MultiViewPanel;
